# 💎 Návrh architektury uzamykání a monetizace témat (ProEdu Freemium)

Tento dokument slouží jako ucelený technický a byznysový návrh pro budoucí implementaci placeného obsahu, uzamykání pokročilých témat a integraci platební brány do aplikace ProEdu.

---

## 1. Byznysový model (Freemium)

### A. Bezplatná vrstva (Free / Základní účet)
* **Cíl**: Získat studenta, ukázat vysokou kvalitu přípravy na přijímací zkoušky a vytvořit návyk každodenního procvičování.
* **Co je zdarma**:
  * Přístup k 1–2 stěžejním základním tématům v každém předmětu (např. *Základní aritmetika a čísla* v Matematice, *Pravopis a vyjmenovaná slova* v Češtině).
  * Režim „Studovat“ (vzorové řešené příklady) pro tato základní témata.
  * Zobrazení základních statistik a kruhových grafů pokroku.
  * Možnost položit 1 dotaz lektorovi měsíčně zdarma.

### B. Prémiová vrstva (ProEdu PRO / Předplatné)
* **Cíl**: Monetizovat komplexní přípravu na zkoušky (9. třída ZŠ / maturita).
* **Co je v PRO**:
  * Odemknutí všech pokročilých a klíčových přijímačkových témat (např. *Geometrie a rýsování*, *Slovní úlohy a soustavy rovnic*, *Práce s textem a literární formy*).
  * Neomezené procvičování s okamžitým vyhodnocením a nápovědami.
  * Prioritní odpovědi lektorů na dotazy k úlohám.
  * Predikce úspěšnosti u ostrých Cermat přijímaček.

---

## 2. Datový model (Firestore & Typy)

### A. Rozšíření profilu uživatele (`users/{uid}`)
```typescript
export interface UserSubscription {
  status: 'free' | 'pro' | 'trial';
  plan?: 'monthly' | 'school_year' | 'one_time';
  validUntil?: Timestamp | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  inquiriesQuotaRemaining?: number; // např. 1 pro free, neomezeno pro PRO
}

export interface UserProfile {
  // stávající pole...
  subscription?: UserSubscription;
}
```

### B. Příznak prémiového obsahu u témat a podtémat
V konfiguraci témat i v databázi (`practiceCourses` / `questions`):
```typescript
export interface SubTopic {
  id: string;
  name: string;
  description: string;
  isPremium: boolean; // false = zdarma, true = vyžaduje PRO
  questionCount: number;
}
```

---

## 3. Uživatelské rozhraní (UX / UI vzory)

1. **Vizuální indikace v seznamu témat**:
   * Prémiová podtémata obsahují štítek **PRO** se zlatým gradientem a ikonou zámečku (`Lock`).
   * Tlačítka *„Studovat“* a *„Procvičit“* jsou vizuálně zřetelná, ale u bezplatného uživatele nesou ikonu zámečku.

2. **Paywall dialog (Upsell Modal)**:
   * Kliknutím na zamčené téma se otevře prémiový dialog:
     * Výhody členství PRO (všechna témata, neomezeně testů, vysvětlení).
     * Cenové možnosti (např. měsíční předplatné vs. jednorázový balíček na celý školní rok do přijímaček).
     * Tlačítko *„Aktivovat ProEdu PRO“*.

---

## 4. Bezpečnost a Firestore Rules (Server-side enforcement)

Podle pravidel projektu ProEdu (zejména Pravidlo 1, 2 a 5):
* **Frontend nikdy nesmí určovat platnost licence:**
  * Klient nesmí sám zapisovat pole `subscription` ani `isPremium`.
  * Při spuštění testu přes backend endpoint (`/api/practice-attempts`) server ověří, zda požadované téma má `isPremium === true`. Pokud ano, ověří v tokenu uživatele (`request.auth.token.isPro`) nebo v `users/{uid}`, zda má aktivní předplatné. Pokud ne, vrátí HTTP 403 s chybou `Vyžaduje prémiové předplatné`.
* **Webhooky platební brány (Stripe / GoPay):**
  * Zpracování probíhá výhradně na serveru přes Cloud Functions / Express endpoint (`/api/webhooks/stripe`).
  * Po úspěšné platbě server bezpečně aktualizuje `subscription.status = 'pro'` a nastaví custom claim `isPro: true` v Firebase Auth.

---

## 5. Fáze nasazení

1. **Fáze 1 (Příprava rozhraní)**: Do témat doplnit příznaky `isPremium` a vizuální odznáčky PRO bez tvrdého blokování (nebo s informačním dialogem „Již brzy“).
2. **Fáze 2 (Backend a brána)**: Napojení Stripe Checkout / GoPay pro platby kartou, automatické prodlužování a správa předplatného.
3. **Fáze 3 (Plné vynucení)**: Uzamčení endpointů a generování testů pro neplatící uživatele na pokročilých tématech.
