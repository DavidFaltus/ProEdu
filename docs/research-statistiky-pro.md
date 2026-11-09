# Výzkum primárních zdrojů: Sekce „Statistiky“ pro PRO uživatele

> **Datum zpracování:** 9. listopadu 2026  
> **Projekt:** ProEdu (`C:\PROJEKTY\PRO EDU\APPKA\ProEdu`)  
> **Účel:** Analýza primárních zdrojů v kódu a databázových pravidlech (`firestore.rules`) pro návrh nové sekce **„Statistiky“ pro PRO uživatele** (úspěšnost, počet procvičení, další metriky a personalizovaná doporučení) v souladu s bezpečnostními pravidly [`.agents/rules/proedu.md`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/.agents/rules/proedu.md).

---

## 1. Ukládání pokusů o procvičování (`tests` vs. `practiceAttempts`)

### 1.1 Jak `PracticeSession.tsx` zaznamenává dokončené cvičení
Při dokončení cvičení ve funkci `handleFinishPractice` ([`src/pages/PracticeSession.tsx` ř. 270–344](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L270-L344)) probíhá:
1. **Výpočet skóre a doby trvání ([ř. 273–276](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L273-L276)):**
   - `correctCount = Object.values(answersMap).filter(a => a.isCorrect).length`
   - `total = questions.length`
   - `percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0`
   - `durationSeconds = Math.round((Date.now() - sessionStartTimeRef.current) / 1000)` *(pozn.: `durationSeconds` se nyní posílá pouze do analytiky `trackPracticeComplete` na [ř. 278–286](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L278-L286), nikoliv do Firestore).*
2. **Pro neregistrovaného hosta (`!user`, [ř. 288–290](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L288-L290)):**
   - Volá se `recordGuestCompletedSubtopic(subtopic.id)` ([`src/services/jokerService.ts` ř. 100–108](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/jokerService.ts#L100-L108)), které ukládá ID podtématu do `localStorage` pod klíčem `proedu_guest_monetization`.
3. **Pro přihlášeného uživatele (`user && subtopic`, [ř. 292–343](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L292-L343)):**
   - Sestaví se mapa odpovědí `answersRecord: Record<string, string>` (`questionId -> userAnswer`, [ř. 293–298](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L293-L298)).
   - Zavolá se `recordPracticeAttempt(...)` ([ř. 301–310](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L301-L310)).
   - Pokud uživatel zodpověděl alespoň 1 otázku (`Object.keys(answersMap).length > 0`), zavolá se `recordPracticeSessionStreak()` ([ř. 317](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L317)) a `completeScheduledPracticeTodo(user.uid, subtopic.id, isPremium)` ([ř. 323–327](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L323-L327)).

### 1.2 Implementace `recordPracticeAttempt` v `practiceService.ts`
Funkce `recordPracticeAttempt` ([`src/services/practiceService.ts` ř. 1069–1097](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts#L1069-L1097)) přijímá `Omit<PracticeAttempt, 'id' | 'completedAt'>` ([`src/types/index.ts` ř. 137–148](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/types/index.ts#L137-L148)) a **ukládá záznam do kolekce `tests`** (nikoliv do `practiceAttempts`):
```typescript
const collRef = collection(db, 'tests');
const newDoc = await addDoc(collRef, {
  title: `Procvičování (${attempt.percentage}%)`,
  description: JSON.stringify({
    subtopicId: attempt.subtopicId,
    subjectId: attempt.subjectId,
    topicId: attempt.topicId,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    percentage: attempt.percentage
  }),
  topic: attempt.subtopicId,
  studentId: effectiveUserId,
  createdBy: effectiveUserId,
  autoGrade: true,
  questions: [],
  createdAt: Timestamp.now()
});
```
- **Důležitý detail:** Pole `answers` předané z `PracticeSession.tsx` se v `recordPracticeAttempt` do dokumentu v kolekci `tests` neukládá (ukládají se souhrnné metriky `subtopicId`, `subjectId`, `topicId`, `score`, `totalQuestions`, `percentage` serializované jako JSON v poli `description`, které má v `firestore.rules` limit `<= 1000` znaků na [ř. 87](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L87)).
- **Kolekce `practiceAttempts`:** Ačkoliv je v [`firestore.rules` (ř. 144–151, 380–384)](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L380-L384) definována kolekce `practiceAttempts` s validací `isValidPracticeAttempt`, v celém klientském kódu `src/` se do `practiceAttempts` nezapisuje ani se z ní nečte – veškerá historie procvičování žáků je reálně uložena v kolekci **`tests`**.

---

## 2. Výpočet statistik žáků pro učitele (`studentProgressService.ts` & `StudentsProgressManager.tsx`)

### 2.1 Datový model a agregace v `studentProgressService.ts`
Služba [`src/services/studentProgressService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts) již obsahuje kompletní parsování a výpočet statistik z kolekce `tests`:
- **Rozhraní `StudentPracticeAttempt` ([ř. 6–16](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L6-L16)):**
  `id`, `studentId`, `subtopicId`, `subtopicTitle`, `subject`, `score`, `totalQuestions`, `percentage`, `createdAt: Date`.
- **Rozhraní `StudentProgressItem` ([ř. 18–37](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L18-L37)):**
  Obsahuje agregované metriky:
  - `totalAttempts: number` (celkový počet dokončených procvičování)
  - `averagePercentage: number` (průměrná úspěšnost v %: `Math.round(sum(percentage) / totalAttempts)`, [ř. 140–142](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L140-L142))
  - `totalQuestions: number` (celkový počet zodpovězených otázek napříč pokusy, [ř. 139](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L139))
  - `totalScore: number` (celkový počet správných odpovědí, [ř. 138](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L138))
  - `lastPracticeAt: Date | null` (datum posledního procvičování, [ř. 147](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L147))
  - `mathAttemptsCount: number` (počet pokusů z Matematiky, [ř. 144](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L144))
  - `czechAttemptsCount: number` (počet pokusů z Češtiny, [ř. 145](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L145))
  - `attempts: StudentPracticeAttempt[]` (seřazeno sestupně od nejnovějšího, [ř. 135](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L135))
- **Funkce `parseTestAttempt` ([ř. 39–89](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L39-L89)):**
  - Dekóduje `data.description` pomocí `JSON.parse(data.description)` a vytáhne `subtopicId`, `score`, `totalQuestions`, `percentage`, `subjectId`.
  - Spáruje `subtopicId` s mapou podtémat (`getSubtopics()`) pro získání aktuálního názvu `subtopic?.title` a předmětu `subtopic?.subjectId`.
  - Normalizuje `createdAt` na `Date` a omezí `percentage` na rozsah `0..100`.
- **Proč `getStudentsProgressList()` ([ř. 94–192](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L94-L192)) nelze volat přímo z účtu studenta:**
  - Provádí broad read `getDocs(collection(db, 'users'))` a `getDocs(collection(db, 'tests'))` bez filtru `where('studentId', '==', uid)`. Podle [`firestore.rules` (ř. 335, 349)](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L335) má student povoleno číst pouze své vlastní dokumenty (`resource.data.studentId == request.auth.uid`). Pro studenta tedy musíme dotazovat `query(collection(db, 'tests'), where('studentId', '==', user.uid))` a použít stejnou logiku parsování `parseTestAttempt`.

### 2.2 Vizuální prezentace v `StudentsProgressManager.tsx`
V administraci učitele ([`src/components/admin/StudentsProgressManager.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/StudentsProgressManager.tsx)) jsou statistiky vykresleny pomocí:
- **Barevných škál úspěšnosti ([ř. 288–298](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/StudentsProgressManager.tsx#L288-L298)):**
  - `>= 80 %`: zelená (`bg-emerald-50 text-emerald-800 border-emerald-200`, progress bar `bg-emerald-500`)
  - `>= 50 %`: oranžová/žlutá (`bg-amber-50 text-amber-800 border-amber-200`, progress bar `bg-amber-500`)
  - `< 50 %`: červená (`bg-rose-50 text-rose-800 border-rose-200`, progress bar `bg-rose-500`)
- **Detailních KPI karet studenta ([ř. 623–676](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/StudentsProgressManager.tsx#L623-L676)):**
  - 3 hlavní boxy (`bg-[#FAF7F0] p-3 rounded-2xl`): **Procvičeno lekcí** (`totalAttempts`), **Úspěšnost průměr** (`averagePercentage%`), **Otázky správných** (`totalScore / totalQuestions`).
  - 2 předmětové karty: **Matematika** (`BrainPinkIcon`, `mathAttemptsCount×`) a **Čeština** (`BookCyanIcon`, `czechAttemptsCount×`).
- **Seznamu naplánovaných cvičení v kalendáři ([ř. 680–812](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/StudentsProgressManager.tsx#L680-L812))** a **Historie procvičovaných témat s filtrem předmětu (`Vše` / `Matika` / `Čeština`, [ř. 815–922](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/StudentsProgressManager.tsx#L815-L922))**.

---

## 3. Personalizovaná doporučení (`recommendationService.ts` & `StudentDashboard.tsx`)

### 3.1 Algoritmus v `recommendationService.ts`
Funkce `getPersonalizedRecommendations(userId?: string, userFocusAreas: string[] = [])` ([`src/services/recommendationService.ts` ř. 161–417](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L161-L417)):
1. **Načtení katalogu ([ř. 167–186](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L167-L186)):**
   Načte `getTopics()` a `getSubtopics()` (z paměťové cache `cacheManager` s TTL 10 min) a odfiltruje skrytá témata a podtémata (`!s.isHidden && !hiddenTopicKeys.has(s.topicId)`).
2. **Načtení historie pokusů studenta ([ř. 189–240](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L189-L240)):**
   Dotazuje `query(collection(db, 'tests'), where('studentId', '==', userId), limit(30))`. Pro každé `subtopicId` agreguje do `attemptsMap`:
   - `attemptsCount` (počet pokusů)
   - `lastPercentage` (úspěšnost nejnovějšího pokusu)
   - `bestPercentage` (nejlepší dosažená úspěšnost)
   - `lastAttemptAt` (`Date` posledního pokusu)
3. **Skórování a klasifikace všech podtémat ([ř. 258–355](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L258-L355)):**
   Každému podtématu přiřadí `priorityScore`, `badge` (`warning` | `accent` | `info` | `success`) a `reasonText` podle 5 prioritních případů:
   - **Případ 1 (`stats.lastPercentage < 70`, [ř. 274–288](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L274-L288)):** Nejvyšší priorita k doučení (`priorityScore = 100 + (70 - stats.lastPercentage)`), odznak `Naposledy X %` (`warning`).
   - **Případ 2 (`isFocusArea && (!stats || stats.bestPercentage < 90)`, [ř. 291–305](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L291-L305)):** Shoda s `userFocusAreas` (`priorityScore = 85`), odznak `Tvé zaměření` (`accent`).
   - **Případ 3 (`!stats || stats.attemptsCount === 0`, [ř. 308–321](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L308-L321)):** Dosud neprocvičované téma (`priorityScore = 65 - (subtopic.order ?? 0) * 0.1`), odznak `Nové téma` (`info`).
   - **Případ 4 (`daysSince >= 7`, [ř. 324–339](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L324-L339)):** Procvičeno před 7 a více dny (`priorityScore = 40 + Math.min(daysSince, 30)`), odznak `Oprášit znalosti` (`success`).
   - **Případ 5 (Zvládnuto nedávno s `>= 70 %`, [ř. 342–354](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L342-L354)):** `priorityScore = 10 + stats.bestPercentage * 0.1`, odznak `Zvládnuto • X %` (`success`).
4. **Balancovaný výběr ([ř. 357–392](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L357-L392)):**
   Vybírá top 1 z Matematiky, top 1 z Češtiny a 3. položku s vyšším `priorityScore` ze zbývajících.

### 3.2 Zobrazení na nástěnce (`StudentDashboard.tsx`)
V [`src/pages/StudentDashboard.tsx` (ř. 108–133, 370–611)](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudentDashboard.tsx#L370-L611) se vykreslují 3 doporučené karty vedle kalendáře (`QuickCalendar`), přičemž každá karta nabízí:
- Tlačítko **„Přidat do kalendáře“** (`PracticeScheduleModal`, s odznakem `PRO` pro neplatící na [ř. 557–561](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudentDashboard.tsx#L557-L561)),
- Tlačítko **„Studovat“** (pokud `item.hasStudyMaterial`, zamčeno pro Free uživatele s `UnifiedPaywallModal` na [ř. 564–589](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudentDashboard.tsx#L564-L589)),
- Tlačítko **„Procvičit“** (`/practice/session/${item.subtopicId}`, [ř. 591–603](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudentDashboard.tsx#L591-L603)).

---

## 4. Další data o aktivitě studenta a oprávnění ve `firestore.rules`

### 4.1 Přehled dostupných polí a kolekcí pro studenta
| Zdroj dat | Pole / Kolekce | Kde v kódu se plní / čte | Pravidla čtení studentem ve `firestore.rules` |
| :--- | :--- | :--- | :--- |
| **`users/{uid}`** ([`src/types/index.ts` ř. 7–46](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/types/index.ts#L7-L46)) | `streak` (`0..10`), `lastStreakPracticeDate` (`YYYY-MM-DD`), `jokers`, `dailyVideosWatched`, `focusAreas`, `gardenPlants`, `focusSessionsHistory` | [`AuthContext.tsx` ř. 532–534](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/AuthContext.tsx#L532-L534), [`jokerService.ts` ř. 204–245](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/jokerService.ts#L204-L245), [`TimerContext.tsx` ř. 46–71](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/TimerContext.tsx#L46-L71) | [`firestore.rules` ř. 334–335](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L334-L335): `allow read: if isAuthenticated() && (isOwner(uid) || isAdmin());` |
| **Kolekce `tests`** | `title`, `description` (JSON se `subtopicId`, `subjectId`, `topicId`, `score`, `totalQuestions`, `percentage`), `topic`, `studentId`, `createdAt` | Zápis: [`practiceService.ts` ř. 1069–1097](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts#L1069-L1097); Čtení: [`recommendationService.ts` ř. 193–195](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L193-L195) | [`firestore.rules` ř. 348–349](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L348-L349): `allow read: if isAdmin() || (isAuthenticated() && resource.data.studentId == request.auth.uid);` *(Vyžaduje `where('studentId', '==', user.uid)`)* |
| **Kolekce `todos`** ([`src/types/index.ts` ř. 247–264](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/types/index.ts#L247-L264)) | `studentId`, `title`, `type` (`'practice'`, `'course_lesson'`, ...), `completed`, `addedBy` (student vs. učitel), `dueDate`, `completedAt`, `referenceId` (`subtopicId`), `subjectId`, `topicId`, `planId`, `repetitionIndex`, `totalRepetitions` | [`calendarService.ts` ř. 483–637](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/calendarService.ts#L483-L637), [`StudentDashboard.tsx` ř. 136–153](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudentDashboard.tsx#L136-L153) | [`firestore.rules` ř. 415–416](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L415-L416): `allow read: if isAuthenticated() && (isOwner(resource.data.studentId) || isAdmin());` *(Vyžaduje `where('studentId', '==', user.uid)`)* |
| **Kolekce `questionInquiries`** | Dotazy studenta na lektora k úlohám (`studentId`, `questionId`, `topic`, `status`: `'pending'` \| `'answered'`, `reply`) | [`src/services/inquiryService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/inquiryService.ts), [`PracticeSession.tsx` ř. 369–402](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx#L369-L402) | [`firestore.rules` ř. 473–474](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L473-L474): `allow read: if isAuthenticated() && (isOwner(resource.data.studentId) || isAdmin());` |
| **Kolekce `assignedTests`** | Přiřazené testy (`studentId`, `testTitle`, `status`: `'pending'` \| `'submitted'` \| `'graded'`, `grade`, `feedback`, `topicPerformance`) | Pravidla připravena; stránky [`TestTaker.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/TestTaker.tsx) a [`TestReview.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/TestReview.tsx) jsou zatím placeholder („Tato sekce se připravuje...“) | [`firestore.rules` ř. 386–387](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L386-L387): `allow read: if isAuthenticated() && (isOwner(resource.data.studentId) || isAdmin());` |
| **Kolekce `focusSessions`** vs. `profile.focusSessionsHistory` | Relace soustředění ze Zahrádky (`plantType`, `plantName`, `duration`, `todoTitle`, `tag`, `completedAt`) | [`TimerContext.tsx` ř. 46–65](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/TimerContext.tsx#L46-L65) ukládá relace do `profile.focusSessionsHistory` a `profile.gardenPlants`*(pozor: v `isValidUser` ve [`firestore.rules` ř. 53–83](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L53-L83) nejsou `gardenPlants` a `focusSessionsHistory` explicitně vyjmenované, ale `isValidUser` neblokuje neznámá pole, pokud splňují základní podmínky)*. | [`firestore.rules` ř. 466–467](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L466-L467): `allow read: if isAuthenticated() && (isOwner(resource.data.studentId) || isAdmin());` |
| **`localStorage` (`GuestState`)** | `completedSubtopics: string[]`, `videosWatched: number` | [`jokerService.ts` ř. 18–21, 100–108](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/jokerService.ts#L18-L21) | Pouze pro nepřihlášeného hosta v prohlížeči. Pro přihlášeného studenta se dokončená podtémata odvozují z kolekce `tests`. |

### 4.2 Indexy ve `firestore.indexes.json` a dotazování historie studenta
Ve [`firestore.indexes.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.indexes.json) **není** definován složený index pro kolekci `tests` na `(studentId ASC, createdAt DESC)`.
- Proto dotaz `query(collection(db, 'tests'), where('studentId', '==', user.uid))` (bez `orderBy('createdAt', 'desc')` v samotném Firestore dotazu, případně s `limit(200)`) **nevyžaduje žádný složený index**, nikdy neselže na `FAILED_PRECONDITION` a pokusy lze spolehlivě seřadit v paměti klienta (`attempts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())`), přesně jak to dělá [`studentProgressService.ts` ř. 135](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/studentProgressService.ts#L135) a [`recommendationService.ts` ř. 193–195](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/recommendationService.ts#L193-L195).

---

## 5. Fungování PRO / Premium gatingu v navigaci a na stránkách

### 5.1 Určení PRO statusu v `AuthContext.tsx`
V [`src/context/AuthContext.tsx` (ř. 529–531)](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/AuthContext.tsx#L529-L531) se oprávnění odvozují z `profile?.role`:
```typescript
const isTeacher = profile?.role === 'teacher';
const isPremium = profile?.role === 'premium' || profile?.role === 'course' || profile?.role === 'teacher';
const isCourseUser = profile?.role === 'course' || profile?.role === 'teacher';
```
Ve [`firestore.rules` (ř. 24–31)](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L24-L31) tomu odpovídá helper `isPremiumOrAdmin()`, který ověřuje roli `in ['premium', 'course', 'teacher']` z Auth tokenu nebo dokumentu `/users/$(request.auth.uid)`.

### 5.2 Navigace v `StudentSidebar.tsx` a `App.tsx`
1. **Desktopový levý panel ([`src/components/StudentSidebar.tsx` ř. 59–91](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/StudentSidebar.tsx#L59-L91)):**
   - Položky jsou definovány v poli `menuItems`:
     - `Hlavní stránka` (`/`, `LayoutDashboard`)
     - `Procvičování` (`/practice`, `BrainPinkIcon`)
     - `Materiály` (`/learning`, `BookCyanIcon` / `MaterialYellowIcon`, `locked: !isPremium`)
     - `Kurzy` (`/courses`, `CapIcon`)
     - `Administrace` (`/teacher`, `TeamBlueIcon`, pouze pokud `isTeacher`)
   - Pokud má položka `locked: !isPremium`, vykreslí se napravo ikona zámku ([ř. 149–151](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/StudentSidebar.tsx#L149-L151)):
     ```tsx
     {item.locked && (
       <Lock size={15} className="ml-auto text-amber-600/90 shrink-0" />
     )}
     ```
2. **Mobilní spodní lišta a router ([`src/App.tsx` ř. 119–151, 275–337, 343–373](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/App.tsx#L119-L151)):**
   - Pole `navItems` v `App.tsx` definuje mobilní spodní lištu (`Domů`, `Procvičování`, `Materiály` s `locked: !isPremium`, `Kurzy`, `Admin`).
   - U zamčené položky na mobilu se zobrazuje `<Lock size={10} className="absolute top-1 right-2 text-amber-700" />` ([ř. 367–369](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/App.tsx#L367-L369)).
   - Routy v `<Routes>` ([`src/App.tsx` ř. 275–337](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/App.tsx#L275-L337)) jsou načítány přes `React.lazy`. Stránky jako `/learning` nejsou obalené v `<PrivateRoute>`, aby si i Free uživatel nebo host mohl stránku otevřít a vidět rozmazaný náhled s paywallem (`UnifiedPaywallModal`).

### 5.3 Vzor PRO Paywallu na stránce (`LearningSheets.tsx` & `UnifiedPaywallModal.tsx`)
Stránka [`src/pages/LearningSheets.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/LearningSheets.tsx) slouží jako referenční vzor pro PRO-gated sekci:
- **Rozmazání obsahu na pozadí pro `!isPremium` ([`LearningSheets.tsx` ř. 165](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/LearningSheets.tsx#L165)):**
  ```tsx
  <div className={cn("transition-all", !isPremium && "filter blur-sm select-none pointer-events-none")}>
  ```
- **Automatické otevření `UnifiedPaywallModal` ([`LearningSheets.tsx` ř. 379–387](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/LearningSheets.tsx#L379-L387)):**
  ```tsx
  <UnifiedPaywallModal
    isOpen={!isPremium && !isPaywallDismissed}
    onClose={() => {
      setIsPaywallDismissed(true);
      navigate('/practice'); // nebo '/'
    }}
    type="premium"
    description="..."
  />
  ```
- **`UnifiedPaywallModal` ([`src/components/common/UnifiedPaywallModal.tsx` ř. 60–68](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/common/UnifiedPaywallModal.tsx#L60-L68)):**
  Přijímá props `isOpen`, `onClose`, `type: 'premium' | 'course'`, volitelný `title`, `description` a `onSuccess`. V dev režimu lze navíc přepínat role (`free` / `premium` / `course` / `teacher`) pomocí `DevMonetizationToolbar` a `updateProfileData`.

### 5.4 Dostupné vlastní ikony (`CustomIcon.tsx`)
V [`src/components/common/CustomIcon.tsx` (ř. 4–24, 79–118)](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/common/CustomIcon.tsx#L4-L24) jsou předpřipraveny SVG ikony z `/icons/*.svg`:
- `StarPinkIcon` (`hvezda`), `StarYellowIcon` (`hvezda2`) – prémiové odznaky, úspěchy a doporučení
- `BrainPinkIcon` (`mozek`), `BrainWhiteIcon` (`mozek-bila`) – Matematika / procvičování
- `BookCyanIcon` (`kniha`), `BookWhiteIcon` (`kniha-bila`), `MaterialYellowIcon` (`material`) – Čeština / studium / materiály
- `CorrectCyanIcon` (`spravne`), `WrongPinkIcon` (`spatne`) – správné/špatné odpovědi a splněné úkoly
- `CalendarBlueIcon` (`kalendar`) – kalendář a plány
- `HeartPinkIcon` (`srdce`) – streak a motivace
- `BulbYellowIcon` (`zarovka`) – tipy a vysvětlení
- Pro grafy a statistické ikony v navigaci či kartách se v projektu kombinují tyto `CustomIcon` komponenty s ikonami z `lucide-react` (`BarChart3`, `TrendingUp`, `Award`, `Clock`, `CheckCircle2`, `Lock` – viz [`StudentsProgressManager.tsx` ř. 2–25](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/StudentsProgressManager.tsx#L2-L25)).

---

## 6. Doporučená architektura pro novou sekci „Statistiky“ (PRO)

Na základě primárních zdrojů lze novou sekci **Statistiky** (`/statistics` nebo `/stats`) postavit čistě, bezpečně a bez nutnosti měnit databázové schéma či přidávat složené indexy:

1. **Zdroj dat (100% kompatibilní se současnými `firestore.rules`):**
   - **Historie pokusů (`tests`):** Dotaz `query(collection(db, 'tests'), where('studentId', '==', user.uid))` na straně klienta (nebo ve sdílené službě např. `getStudentOwnStatistics(user.uid)` v `studentProgressService.ts` / `statisticsService.ts`), který využije existující logiku `parseTestAttempt` a mapu `getTopics()` + `getSubtopics()`.
   - **Plán a kvóty (`todos`):** Dotaz `query(collection(db, 'todos'), where('studentId', '==', user.uid))` pro vyhodnocení plnění studijního plánu (kolik naplánovaných cvičení žák splnil včas, kolik má v plánu a kolik po termínu, včetně cvičení zadaných učitelem `addedBy !== user.uid`).
   - **Profilové metriky (`AuthContext` -> `profile`):** Aktuální `streak`, `focusAreas`, `gardenPlants` / `focusSessionsHistory` (odpracované minuty soustředění).
   - **Personalizovaná doporučení (`recommendationService.ts`):** Rozšířené využití skórovací logiky z `getPersonalizedRecommendations` – kromě top 3 doporučených podtémat lze přímo ze spočítaných statistik ukázat:
     - **Slabá místa k doučení** (podtémata s poslední nebo průměrnou úspěšností `< 70 %`),
     - **Silné stránky / Zvládnutá témata** (podtémata s úspěšností `>= 80 %`),
     - **Pokrytí katalogu k přijímačkám** (kolik z celkového počtu viditelných podtémat v Matematice a Češtině už student alespoň jednou procvičil: `procvičená podtémata / celkem podtémat`).
2. **PRO Gating:**
   - V `StudentSidebar.tsx` a `App.tsx` přidat položku `Statistiky` (`/statistics`) s `locked: !isPremium`.
   - Na stránce `/statistics` použít vzor z `LearningSheets.tsx`: pro `!isPremium` zobrazit ukázková/reálná data na pozadí s `filter blur-sm select-none pointer-events-none` a přes ně otevřít `UnifiedPaywallModal` (`type="premium"`). Pokud uživatel modal zavře, přesměrovat jej nebo zobrazit uzamčený banner s CTA tlačítkem pro odemknutí ProEdu Premium.
