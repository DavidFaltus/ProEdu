# Technický výzkum: Implementace „Sign in with Apple“ (Apple ID) v aplikaci ProEdu

> **Datum zpracování:** 18. listopadu 2026  
> **Projekt:** ProEdu (React 19, TypeScript, Express backend `server/index.js`, Firebase Auth, Cloud Firestore, Capacitor 8)  
> **Cíl dokumentu:** Posoudit technickou a organizační náročnost přidání přihlášení přes Apple ID (*Sign in with Apple*) k existujícím metodám přihlášení v ProEdu, zmapovat co lze znovupoužít ze stávající architektury, jaké kroky jsou nutné mimo kód (Apple Developer Portal + Firebase Console) a jaká jsou rizika a bezpečnostní dopady dle `.agents/rules/proedu.md`.

---

## 1. Manažerské shrnutí a odhad pracnosti

Přidání **Sign in with Apple** do webové aplikace ProEdu je po stránce kódu **nízko až středně náročné**, protože aplikace už používá modulární Firebase Auth SDK (`firebase` `^11.0.1`) s OAuth flow pro Google a má robustní backendový `session-bootstrap` (`server/index.js`), který automaticky vytváří profil v `users/{uid}` a synchronizuje custom claims bez ohledu na typ přihlašovacího providera.

Největší překážkou a časovou investicí **není programování**, ale **administrativa a konfigurace mimo kód**:
1. Nutnost placeného **Apple Developer Programu ($99 / rok)**.
2. Nastavení identifikátorů, klíče `.p8` a **ověření odesílací e-mailové domény (SPF/DKIM)** v Apple Developer Portalu kvůli funkci *Hide My Email*.
3. Pokud by aplikace v budoucnu mířila na **iOS App Store** (aktuálně existuje pouze `android/`), spouští se povinnost dle **App Store Review Guidelines 4.8** a nutnost nativního Capacitor pluginu (`@capacitor-firebase/authentication`).

### Odhad pracnosti (realistický)

| Oblast | Časový odhad | Poznámka |
| :--- | :---: | :--- |
| **Apple Developer Portal + Firebase Console** | 1–2 hod *(+ čekání na schválení Apple Developer účtu, typicky 24–48 hod)* | Registrace App ID, Services ID, `.p8` klíče, Return URL, ověření domény pro Hide My Email, vložení do Firebase Console. |
| **Frontend (Web) – kód + UI + error handling** | 2–4 hod | `OAuthProvider('apple.com')` v `AuthContext.tsx`, tlačítka dle Apple HIG v `AuthModal.tsx` a `Login.tsx`, ošetření kolizí účtů a chybějícího jména. |
| **Testování (Web + Safari iOS + Hide My Email)** | 2–3 hod | Ověření na desktopu, iOS Safari (popup/redirect), kontrola doručení e-mailu na `@privaterelay.appleid.com` a test kolize s existujícím účtem. |
| **Capacitor Android / budoucí iOS (volitelné)** | + 4–8 hod | Pro spolehlivé fungování v nativní mobilní appce instalace `@capacitor-firebase/authentication`, pro iOS navíc Xcode setup a capability *Sign in with Apple*. |
| **Celkem (pouze Web)** | **~ 5–9 hod práce** | + externí čekání na aktivaci Apple Developer Programu a DNS propagaci. |

---

## 2. Aktuální stav autentizace v ProEdu (co už je hotové)

Průzkum repozitáře ukázal, že architektura autentizace je na přidání dalšího OAuth providera velmi dobře připravená:

1. **Podporované login metody dnes:**
   - **E-mail + heslo** (`signInWithEmailAndPassword`) a vlastní **registrace s 6místným OTP kódem** přes backend (`initRegistration`, `confirmRegistration` -> `signInWithCustomToken`) v [`src/context/AuthContext.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/AuthContext.tsx#L582-L651) a [`server/index.js`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/server/index.js#L859-L1135).
   - **Google OAuth** (`GoogleAuthProvider` + `signInWithPopup`) v [`src/context/AuthContext.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/AuthContext.tsx#L577-L580).
   - V [`firebase.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firebase.json#L2-L9) jsou v sekci `auth.providers` deklarovány pouze `emailPassword: true` a `googleSignIn`.

2. **Automatický bootstrap profilu a Custom Claims (znovupoužitelné beze změn):**
   - Každé přihlášení (včetně OAuth) spustí `onAuthStateChanged` v [`src/context/AuthContext.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/AuthContext.tsx#L450-L491), který zavolá `syncUserProfile` -> `POST /api/auth/session-bootstrap` ([`src/context/AuthContext.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/AuthContext.tsx#L282-L308)).
   - Endpoint `POST /api/auth/session-bootstrap` v [`server/index.js`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/server/index.js#L647-L743) v Firestore transakci:
     - Pokud dokument `users/{uid}` neexistuje, automaticky jej vytvoří s defaultní rolí `free` (nebo `teacher` z custom claims), `jokers: 10`, `streak: 0`, `enrolledCourseIds: []`, `referralCode`, `emailVerified` a `createdAt`.
     - Následně zavolá `syncCustomClaimsIfNeeded` ([`server/index.js`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/server/index.js#L726-L731)).
   - **Výsledek:** Přihlášení přes Apple ID nebude vyžadovat žádný nový endpoint pro zakládání uživatele – `session-bootstrap` jej obslouží identicky jako Google OAuth.

3. **UI přihlášení:**
   - Přihlašovací formuláře existují na dvou místech: v modálu [`src/components/AuthModal.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/AuthModal.tsx#L223-L238) (tlačítko Google na ř. 512–538) a na stránce [`src/pages/Login.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/Login.tsx#L199-L215) (tlačítko Google na ř. 459–468).

4. **Bezpečnostní pravidla Firestore (`firestore.rules`):**
   - Kolekce `users/{userId}` v [`firestore.rules`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L646-L658) povoluje čtení pouze vlastníkovi nebo učiteli (`isOwner(userId) || isTeacher()`).
   - Validace `isValidUserCreate` ([`firestore.rules`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L137-L188)) a `isValidUserProfileOwnerUpdate` ([`firestore.rules`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firestore.rules#L189-L230)) chrání privilegovaná pole (`role`, `jokers`, `subscriptionStatus`, `enrolledCourseIds`, `isAdmin`, `uid`, `email`, `createdAt`) a dovolují klientovi bezpečně měnit `name` a `displayName`.

5. **Platformy (Web + Capacitor):**
   - Dle [`package.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/package.json#L24-L25) a [`capacitor.config.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/capacitor.config.json#L1-L8) aplikace cílí na **Web** a **Capacitor Android** (`@capacitor/android: ^8.5.3`, `androidScheme: "https"`).
   - Složka `android/` v repozitáři existuje, **složka `ios/` ani `@capacitor/ios` v projektu zatím nejsou**.

6. **E-mailová infrastruktura (`server/services/emailService.js`):**
   - E-maily se odesílají přes `nodemailer` z adresy `SMTP_FROM` (`ProEdu <info@pro-edu.eu>`, [`server/services/emailService.js`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/server/services/emailService.js#L11-L13)) pro doménu `https://proeducator.eu`.

---

## 3. Co je potřeba nastavit mimo kód (Apple Developer & Firebase Console)

### 3.1 Apple Developer Portal (nutný placený účet)
*Primární zdroj: [Apple Developer – Sign in with Apple](https://developer.apple.com/sign-in-with-apple/) a [Firebase Docs – Authenticate Using Apple (Web)](https://firebase.google.com/docs/auth/web/apple).*

1. **Členství v Apple Developer Programu:**
   - Pro používání *Sign in with Apple* v produkci je povinné aktivní placené členství (**$99 / rok**). Bez něj nelze v portálu registrovat *Services ID* ani generovat klíče pro *Sign in with Apple*.
2. **App ID (Primary Identifier):**
   - V *Certificates, Identifiers & Profiles -> Identifiers -> App IDs* zaregistrovat Bundle ID aplikace (v [`capacitor.config.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/capacitor.config.json#L2) je `com.proedu.app`) a zapnout capability **Sign in with Apple**.
3. **Services ID (pro webový OAuth flow ve Firebase):**
   - V *Identifiers -> Services IDs* vytvořit identifikátor (např. `com.proedu.app.service`), zapnout **Sign in with Apple**, přiřadit jej k primárnímu App ID a nastavit:
     - **Domains and Subdomains:** `<authDomain>` z Firebase konfigurace (aktuálně `gen-lang-client-0972842509.firebaseapp.com` dle [`firebase-applet-config.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firebase-applet-config.json#L5), případně vlastní doména `proeducator.eu`).
     - **Return URLs:** `https://gen-lang-client-0972842509.firebaseapp.com/__/auth/handler` (případně `https://proeducator.eu/__/auth/handler`, pokud se `authDomain` přepne na vlastní doménu).
4. **Private Key (`.p8`) a Key ID:**
   - V *Keys* vytvořit nový klíč se zapnutou službou **Sign in with Apple** a přiřazeným App ID.
   - Stáhnout soubor `AuthKey_XXXXXXXXXX.p8` (**Apple umožňuje stažení pouze jednou!**) a poznamenat si **Key ID** (10 znaků) a **Team ID** (10 znaků z *Membership Details*).
   - *Poznámka k expiraci:* Samotný `.p8` klíč neexpiruje (na rozdíl od krátkodobého `client_secret` JWT s max. platností 6 měsíců, který si ale Firebase z `.p8` generuje a obnovuje automaticky).
5. **Konfigurace pro Hide My Email (kritické pro doručitelnost):**
   - V Apple Developer Portalu v sekci *Services -> Sign in with Apple for Email Communication* je nutné zaregistrovat odesílací doménu (`pro-edu.eu`) a e-mailovou adresu (`info@pro-edu.eu`), která má platné **SPF a DKIM** DNS záznamy. Bez tohoto kroku Apple Private Email Relay e-maily od ProEdu (faktury, potvrzení objednávek, reset hesla) **odmítne doručit**.

### 3.2 Firebase Console
*Primární zdroj: [Firebase Docs – Authenticate Using Apple](https://firebase.google.com/docs/auth/web/apple).*

1. V **Firebase Console -> Authentication -> Sign-in method** přidat a povolit providera **Apple**.
2. Vyplnit údaje z Apple Developer Portalu:
   - **Services ID** (`com.proedu.app.service`)
   - Rozbalit *OAuth code flow configuration* a vyplnit **Apple Team ID**, **Key ID** a nahrát obsah souboru **Private Key (`.p8`)**.
3. Ujistit se, že v **Authorized domains** jsou uvedeny všechny produkční domény (např. `proeducator.eu`, `localhost`).

---

## 4. Co je potřeba upravit v kódu

### 4.1 Frontend (`src/`)
1. **`src/context/AuthContext.tsx`:**
   - Importovat `OAuthProvider` z `'firebase/auth'` (vedle `GoogleAuthProvider` na ř. 8).
   - Přidat metodu `signInWithApple` do `AuthContextType` (ř. 51–87), výchozí hodnoty (ř. 89–125), implementace a `contextValue` (ř. 867–920):
     ```ts
     const signInWithApple = async () => {
       const provider = new OAuthProvider('apple.com');
       provider.addScope('email');
       provider.addScope('name');
       provider.setCustomParameters({ locale: 'cs_CZ' });
       await signInWithPopup(auth, provider);
     };
     ```
   - *Poznámka:* Firebase JS SDK automaticky volá `onAuthStateChanged`, který spustí `syncUserProfile` a `/api/auth/session-bootstrap` stejně jako u Google loginu.
2. **`src/components/AuthModal.tsx` a `src/pages/Login.tsx`:**
   - Přidat `handleApple` / `handleAppleLogin` volající `signInWithApple()`.
   - Ošetřit specifické chyby:
     - `auth/popup-closed-by-user` / `auth/cancelled-popup-request` (tichý návrat nebo jemný `toast.info` jako u Google na ř. 232 / 207).
     - `auth/account-exists-with-different-credential` (srozumitelná česká hláška pro uživatele – viz sekce 5.3).
   - Přidat tlačítko **„Přihlásit se přes Apple“** (ideálně respektující *Apple Human Interface Guidelines* – černé nebo bílé tlačítko s Apple logem a srovnatelnou velikostí jako tlačítko Google).
3. **`firebase.json` (CSP a konfigurace):**
   - V [`firebase.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firebase.json#L60-L62) je přísná `Content-Security-Policy`:
     - `frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://payments.comgate.cz`
     - Při použití `signInWithPopup` přes Firebase `__/auth/handler` se otevírá okno na `https://gen-lang-client-0972842509.firebaseapp.com`, které je již v `frame-src` i `connect-src` (`https://*.firebaseapp.com`). Pokud by se ale v budoucnu použilo Apple JS SDK přímo nebo inline Apple frame, je potřeba přidat `https://appleid.apple.com` do `frame-src` / `script-src` / `connect-src`.
   - Volitelně doplnit sekci `auth.providers` v [`firebase.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firebase.json#L2-L9), pokud se projekt deployuje deklarativně přes CLI.

### 4.2 Backend (`server/index.js`) a Firestore (`firestore.rules`)
- **`server/index.js`:** Žádné zásadní změny nejsou potřeba – `POST /api/auth/session-bootstrap` (ř. 647–743) už zvládne jakéhokoliv nového uživatele z Firebase Auth.
  - *Doporučené drobné vylepšení:* V `session-bootstrap` (ř. 660) se při prvním vytvoření profilu bere `authRecord.displayName || req.decodedToken.name || 'Student'`. Pokud Apple nepošle jméno (viz sekce 5.2), uživatel dostane jméno `'Student'` a může si ho kdykoliv upravit v nastavení profilu, protože `name` a `displayName` jsou v `CLIENT_WRITABLE_PROFILE_FIELDS` ([`src/context/AuthContext.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/context/AuthContext.tsx#L41)) a povolené v `firestore.rules` (ř. 191).
- **`firestore.rules`:** Není potřeba žádná změna pravidel.

### 4.3 Capacitor (Android a případný budoucí iOS)
*Primární zdroj: [Capawesome `@capacitor-firebase/authentication`](https://capawesome.io/plugins/firebase/authentication/).*

- **Aktuální stav:** V [`package.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/package.json#L24-L25) je jen `@capacitor/android`. Webový `signInWithPopup` uvnitř mobilního WebView (Android/iOS) bývá nespolehlivý nebo blokovaný.
- **Řešení pro nativní appku:** Pokud má Apple Sign-In fungovat spolehlivě i v Android/iOS Capacitor aplikaci, je nutné integrovat plugin `@capacitor-firebase/authentication` (`FirebaseAuthentication.signInWithApple()`) a větvit volání přes `Capacitor.isNativePlatform()`.
- Na **iOS** (pokud se někdy přidá `npx cap add ios`) plugin otevře nativní systémový iOS dialog (*ASAuthorizationController*) a vyžaduje zapnutou capability *Sign in with Apple* v Xcode. Na **Androidu** otevře bezpečný OAuth flow přes Custom Tabs.

---

## 5. Rizika, hraniční případy a bezpečnostní aspekty

### 5.1 Hide My Email (`@privaterelay.appleid.com`)
*Primární zdroj: [Apple Developer – Hide My Email](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/authenticating_users_with_sign_in_with_apple) & [Communicating Using the Private Email Relay Service](https://developer.apple.com/documentation/sign_in_with_apple/communicating_using_the_private_email_relay_service).*

- Uživatel si může zvolit anonymní alias `<random>@privaterelay.appleid.com`, který je unikátní pro daný Developer Team.
- **Dopad na ProEdu:**
  1. **E-maily z backendu (`emailService.js`):** Fakturační údaje, potvrzení plateb Comgate a notifikace půjdou na tento alias. Bez ověření domény `pro-edu.eu` a SPF/DKIM v Apple Developer Portalu e-maily **nedojdou**. Apple navíc uplatňuje rate limit (cca 100 e-mailů/den na jednu relay adresu).
  2. **Duplicitní účty:** Pokud má žák v ProEdu již účet přes `jan.novak@gmail.com` (Google/e-mail) a později se přihlásí přes Apple s *Hide My Email*, Firebase jej vyhodnotí jako **zcela nového uživatele** s jiným `uid` (bez zakoupeného Premium či kurzů). Je vhodné na to upozornit v nápovědě/FAQ.

### 5.2 Chybějící jméno při 2. a dalším přihlášení
- Apple posílá objekt se jménem uživatele (`name`) **pouze při úplně prvním přihlášení** (první autorizaci aplikace). Při každém dalším přihlášení vrací už jen `sub` (identifikátor) a případně e-mail.
- **Dopad na ProEdu:** Firebase Auth toto jméno při prvním loginu uloží do `user.displayName` a náš `session-bootstrap` jej zapíše do Firestore `users/{uid}` ([`server/index.js`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/server/index.js#L659-L671)). Problém by nastal pouze tehdy, pokud by první login selhal po autorizaci u Applu ještě před uložením do Firebase/Firestore – pak by uživatel zůstal jako `'Student'` a musel by si jméno doplnit v nastavení profilu.

### 5.3 Kolize účtů a Email Enumeration Protection
*Primární zdroj: [Firebase Docs – Email Enumeration Protection](https://firebase.google.com/docs/auth/web/email-enumeration-protection) & [Link Multiple Auth Providers](https://firebase.google.com/docs/auth/web/account-linking).*

- Pokud se uživatel dříve zaregistroval e-mailem/heslem (s neověřeným nebo jiným providerem) a následně zkusí Sign in with Apple se stejným e-mailem (pokud ho neskryje), Firebase může vyhodit `auth/account-exists-with-different-credential`.
- V projektech s aktivní **Email Enumeration Protection** (výchozí pro projekty vytvořené od 15. 9. 2023) metoda `fetchSignInMethodsForEmail()` **vždy vrací prázdné pole**. Nelze tedy programaticky zjistit ani uživateli vypsat, zda se má přihlásit heslem nebo Googlem.
- **Doporučené řešení:** Zachytit `auth/account-exists-with-different-credential`, zobrazit obecnou zprávu (*„Účet s tímto e-mailem již existuje. Přihlas se prosím původní metodou (e-mailem nebo přes Google) a v nastavení profilu si případně propoj Apple ID.“*) a v nastavení profilu nabídnout tlačítko pro propojení pomocí `linkWithPopup(auth.currentUser, new OAuthProvider('apple.com'))` / `linkWithCredential`.

### 5.4 App Store Review Guidelines 4.8 (iOS)
*Primární zdroj: [Apple App Store Review Guidelines – 4.8 Login Services](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple).*

- **Pravidlo:** Pokud aplikace publikovaná v iOS App Store nabízí přihlášení přes třetí stranu (v ProEdu je to **Google OAuth**), **musí** nabízet i **Sign in with Apple** jako rovnocennou možnost se srovnatelnou viditelností.
- **Dopad na ProEdu:** Dokud ProEdu provozuje jen Web a Android (Capacitor), tato povinnost se jej netýká. Jakmile ale bude chtít vydat iOS verzi v App Store, bude *Sign in with Apple* **povinný** (výjimky platí jen pro čistě firemní/školní interní účty, což ProEdu není, protože umožňuje běžnou veřejnou registraci).

### 5.5 iOS Safari: `signInWithPopup` vs `signInWithRedirect` (ITP)
*Primární zdroj: [Firebase Docs – Best practices for using signInWithRedirect](https://firebase.google.com/docs/auth/web/redirect-best-practices).*

- Na iOS Safari a v moderních prohlížečích blokujících third-party cookies (ITP) selhává `signInWithRedirect`, pokud `authDomain` (`gen-lang-client-0972842509.firebaseapp.com` v [`firebase-applet-config.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/firebase-applet-config.json#L5)) běží na jiné doméně než samotná aplikace (`proeducator.eu`) – `getRedirectResult()` pak vrací `null`.
- **Doporučení pro ProEdu:** Zachovat `signInWithPopup` (stejně jako u `signInWithGoogle` na ř. 579 v `AuthContext.tsx`), spouštět jej výhradně přímo v `onClick` handleru (aby jej Safari nezablokovalo jako nevyžádaný popup), a do budoucna zvážit přepnutí `authDomain` na vlastní doménu přes Firebase Hosting (pokud by byl potřeba `signInWithRedirect`).

### 5.6 Soulad s bezpečnostními pravidly `.agents/rules/proedu.md`
- **Role a oprávnění (Pravidla 2, 4, 5, 11):** Role se nikdy neodvozují z e-mailu (ani z `@privaterelay.appleid.com`). Apple ID pouze autentizuje `uid` ve Firebase Auth; roli (`free`/`premium`/`course`/`teacher`) a custom claims dál autoritativně spravuje `server/index.js` (`session-bootstrap`).
- **Firestore Rules (Pravidla 3, 6, 7, 8, 14, 15):** Stávající pravidla v `firestore.rules` (ř. 137–230, 646–658) plně chrání `users/{uid}` a není nutné je rozvolňovat.
- **Tajné klíče (Pravidlo 13):** Privátní klíč `.p8` stažený z Apple Developer Portalu patří **výhradně do Firebase Console** (Authentication -> Sign-in method -> Apple). Nesmí být nikdy uložen v `src/`, `server/.env` ani v repozitáři.

---

## 6. Závěrečné doporučení

- **Pro Web (krátkodobě):** Implementace je přímočará (~1 pracovní den celkem včetně konfigurace). Nejdříve je nutné založit/ověřit placený **Apple Developer Program ($99/rok)** a nastavit **SPF/DKIM + ověření domény `pro-edu.eu`** pro *Hide My Email*, jinak bude docházet k nedoručování transakčních e-mailů.
- **Pro Mobilní aplikaci (dlouhodobě):** Pokud plánujete vydat iOS verzi v App Store, bude implementace *Sign in with Apple* **povinná** (kvůli Google loginu a pravidlu 4.8) a bude vyžadovat přechod na nativní `@capacitor-firebase/authentication`.
