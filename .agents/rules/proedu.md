---
trigger: always_on
---

Pravidla pro vývoj této aplikace:

1. Bezpečnost je priorita nad rychlostí implementace.
Každá nová funkce musí být navržena tak, aby byla bezpečná už v první verzi. Nepoužívej dočasně otevřená pravidla typu `allow read, write: if true`.

2. Firebase Firestore je jediný zdroj pravdy.
Nikdy nespoléhej na validaci pouze ve frontendu. Veškerá oprávnění, vlastnictví dat, role a omezení polí musí být vynucena ve Firestore Security Rules nebo přes serverovou vrstvu.

3. “Row level security” implementuj jako document-level ownership.
Každý dokument s uživatelskými daty musí obsahovat jednoznačné vlastnictví:
- `uid`
- `studentId`
- `createdBy`
- `ownerId`
a rules musí ověřit, že `request.auth.uid` smí číst nebo měnit jen svoje dokumenty, případně dokumenty povolené jeho rolí.

4. Role nikdy neodvozuj z emailu ve frontendu.
Nepoužívej hardcoded email jako admin/teacher kontrolu. Role se musí určovat pouze:
- z custom claims Firebase Auth, nebo
- z bezpečně spravovaného uživatelského dokumentu zapisovaného jen backendem/adminem.

5. Klient nesmí zapisovat privilegované hodnoty.
Frontend nikdy nesmí sám nastavovat nebo měnit:
- `role`
- `createdBy` jiného uživatele
- `teacherId` bez oprávnění
- `grade`
- `feedback`
- `isAdmin`
- `points`, `credits`, `status` u cizích dat
Tyto operace patří do Cloud Functions nebo musí být velmi přesně omezené pravidly.

6. Každá kolekce musí mít explicitní access model.
Před vytvořením nové kolekce vždy definuj:
- kdo může číst
- kdo může vytvářet
- kdo může upravovat
- kdo může mazat
- která pole jsou neměnná
- která pole může měnit jen owner
- která pole může měnit jen teacher/admin

7. Imutabilní pole musí být chráněna v rules.
Po vytvoření dokumentu nesmí jít měnit:
- `uid`
- `createdAt`
- `createdBy`
- `studentId`
- `testId`
pokud k tomu není explicitní administrátorské oprávnění.

8. Validuj datový tvar v rules.
Každý dokument musí mít přesně definované povinné a volitelné pole, typy a délkové limity. Odmítnout:
- nečekaná pole
- příliš dlouhé stringy
- nevalidní enum hodnoty
- zápisy bez timestampů
- prázdné názvy a title

9. Nepoužívej broad reads.
Nikdy neotvírej čtení celé kolekce všem přihlášeným uživatelům, pokud kolekce obsahuje osobní nebo interní data. Čtení musí být omezené na:
- vlastní data uživatele
- data přiřazená uživateli
- veřejný obsah výslovně označený jako public

10. Osobní údaje minimalizuj.
Do Firestore neukládej zbytečné osobní údaje. Ukládej jen to, co aplikace opravdu potřebuje. Hesla se nikdy neukládají do Firestore, pouze přes Firebase Auth.

11. Citlivé operace přes backend.
Tyto operace musí jít přes Cloud Functions nebo jinou serverovou vrstvu:
- přidělení role teacher/admin
- hromadné přiřazení testů
- zápis známek
- auditní logy
- mazání cizích dat
- generování bezpečnostně citlivých přístupů

12. Firebase Storage musí mít vlastní pravidla.
Každý upload souboru musí mít:
- omezený path namespace
- kontrolu přihlášení
- kontrolu vlastnictví
- whitelist MIME typů
- limit velikosti souboru
- zákaz veřejného čtení bez důvodu

13. Nikdy neukládej tajné klíče do frontendu.
API secrets, admin credentials, service account JSON a interní klíče nesmí být v `src/`, `.env` pro frontend ani v klientském bundlu. Patří jen do serveru nebo secure environment.

14. Každá změna databázového modelu musí upravit i rules.
Pokud agent přidá nové pole nebo kolekci, musí současně:
- upravit Firestore rules
- upravit typy v TypeScriptu
- upravit validaci
- zkontrolovat dotazy a indexy

15. Updaty musí být navrženy jako partial-safe.
Pokud frontend používá `updateDoc`, pravidla musí být napsaná tak, aby podporovala částečné změny bezpečně po polích, ne pouze plnou náhradu dokumentu.

16. Vždy používej princip least privilege.
Každý uživatel, komponenta a operace mají mít jen minimální nutná oprávnění.

17. Logika oprávnění nesmí být jen v UI.
Skrytí tlačítka nestačí. I když UI něco nezobrazuje, backend/rules to musí samostatně blokovat.

18. Každá nová feature musí projít bezpečnostním checklistem.
Před dokončením nové feature agent ověří:
- kdo data čte
- kdo data zapisuje
- zda lze zneužít cizí UID
- zda nejdou měnit privilegovaná pole
- zda rules odpovídají chování UI
- zda existují Storage rules, pokud se nahrávají soubory

19. Nepovoluj fallback řešení, která obcházejí bezpečnost.
Zakázané vzory:
- `allow read: if true`
- role podle email stringu
- zápis admin dat z klienta
- veřejné URL k citlivým souborům bez omezení
- ukládání citlivých dat do localStorage bez důvodu

20. Funkčnost a bezpečnost musí držet pohromadě.
Agent nesmí navrhnout řešení, které je sice funkční, ale rozbíjí security model. Pokud je mezi UX a bezpečností konflikt, navrhni bezpečnou variantu se zachováním použitelnosti.


Technické zásady pro Firebase v tomto projektu:

- Pro role použij Firebase custom claims místo email-based admin logiky.
- `users/{uid}` může číst jen owner a admin/teacher podle potřeby.
- `assignedTests` vytváří pouze teacher/admin, student pouze čte své a odevzdává povolená pole.
- `grade`, `feedback`, `gradedAt` může zapisovat jen teacher/admin.
- `focusAreas`, statistiky a podobné odvozené hodnoty zapisuj přes backend nebo explicitně bezpečně povolená pole.
- Všechny uploady do Storage ukládej do namespacovaných cest, např. `learningSheets/{teacherUid}/{fileId}`.
- Každý soubor musí mít owner metadata a rules musí kontrolovat vlastnictví.
- U veřejných studijních materiálů odděl veřejná data od soukromých dat do samostatných kolekcí.

Aplikaci spouští vždy na portu 3005  toto použij při debugování

Pro debug učitele využívej účet ucitel@ucitel.cz s heslem ucitel123 a pro debug žáka využívej účet student@student.cz s heslem student123

---

### Stav implementace platebního systému a možnosti budoucího napojení (Comgate & Fakturace)

#### 1. Aktuální stav (listopad 2026):
- **Objednávkový formulář a Paywall modal:**
  - V `src/components/common/UnifiedPaywallModal.tsx` funguje 2-krokový proces (Výběr balíčku -> Fakturační formulář -> Platební instrukce).
  - Formulář vyžaduje jméno klienta, fakturační adresu (ulice, město, PSČ), e-mail pro fakturu, souhlas s obchodními podmínkami a volitelný newsletter.
  - Aktuální cena Premium balíčku: **99 Kč / měsíc**.
- **Platba QR kódem (převodem na účet):**
  - Okamžitě funkční díky standardu SPAYD (`src/utils/qrPayment.ts`).
  - Do zprávy pro příjemce se automaticky propisuje e-mail klienta a variabilní symbol = ID objednávky.
  - Bankovní účet je konfigurovatelný v `.env` (`BANK_ACCOUNT_NUMBER`, `BANK_CODE`, `BANK_NAME`, `BANK_RECIPIENT`).
- **Platební brána Comgate (Sandbox / Testovací režim):**
  - Backend připraven v `server/index.js` (`POST /api/orders/create` a webhook `POST /api/payments/comgate/notify`).
  - Podporuje testovací režim (`COMGATE_TEST_MODE="true"`). Dokud nejsou v `.env` zadány ostré klíče od Comgate, funguje v sandbox režimu s možností testovací simulace platby.
  - Po úspěšném zaplacení server automaticky aktivuje `role: 'premium'` v dokumentu uživatele.
- **Správa objednávek pro Učitele/Admina:**
  - V `src/pages/TeacherDashboard.tsx` (záložka „Objednávky“ – `src/components/admin/OrdersManager.tsx`) má učitel přehled všech objednávek a u plateb převodem tlačítko pro ruční schválení platby.
- **Bezpečnost (Firestore Rules):**
  - Objednávky jsou v kolekci `orders`. Klient smí vytvořit pouze svou objednávku se stavem `pending`. Změnu stavu na `paid` a povýšení role smí provést pouze server (Admin SDK) nebo učitel.

#### 2. Možnosti pro budoucí napojení (po podpisu smlouvy s Comgate):
1. **Přechod do ostrého provozu Comgate:**
   - V `.env` na produkčním serveru doplnit:
     ```env
     COMGATE_MERCHANT_ID="<id_klienta_od_comgate>"
     COMGATE_SECRET="<tajny_klic_od_comgate>"
     COMGATE_TEST_MODE="false"
     ```
   - V administraci Comgate nastavit Push URL (webhook) na:
     `https://<vase-domena>/api/payments/comgate/notify`
2. **Automatické vystavování faktur (Fakturační systém):**
   - **Varianta A (Fakturoid API):**
     - Ve webhooku `/api/payments/comgate/notify` nebo při ručním potvrzení učitelem zavolat Fakturoid API (`POST /api/v2/accounts/{slug}/invoices.json`).
     - Fakturoid automaticky vytvoří fakturu, spáruje platbu a odešle PDF fakturu přímo na e-mail klienta.
   - **Varianta B (iDoklad / Vyfakturuj API):**
     - Obdobná integrace přes REST API do serverové vrstvy v `server/index.js`.
   - **Varianta C (Interní generování PDF faktur):**
     - Generování číslované PDF faktury přímo v Node.js (např. přes knihovnu `pdfkit` nebo HTML template) a odeslání přes Nodemailer / SendGrid.
