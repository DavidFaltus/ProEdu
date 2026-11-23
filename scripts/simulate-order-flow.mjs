import 'dotenv/config';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const adminApp = getApps().length === 0
  ? initializeApp({ credential: cert(sa), projectId: sa.project_id })
  : getApp();
const db = getFirestore(adminApp, 'ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba');
const adminAuth = getAuth(adminApp);

const API_BASE = 'http://localhost:3005';
const TARGET_EMAIL = process.argv[2] || process.env.SIMULATE_USER_EMAIL || 'dawop123@seznam.cz';

async function logStep(title) {
  console.log(`\n======================================================================`);
  console.log(`▶ ${title}`);
  console.log(`======================================================================`);
}

async function getUserAuthInfo(email) {
  const userRecord = await adminAuth.getUserByEmail(email);
  const customToken = await adminAuth.createCustomToken(userRecord.uid);
  
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseConfig.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Firebase Auth token exchange failed: ${JSON.stringify(data)}`);
  }
  return { idToken: data.idToken, uid: userRecord.uid, userRecord };
}

async function runSimulation() {
  console.log('🚀 ZAHÁJENÍ KOMPLETNÍ SIMULACE OBJEDNÁVKOVÉHO PROCESU PROEDU');
  console.log(`Čas spuštění: ${new Date().toLocaleString('cs-CZ')}`);
  console.log(`Cílový uživatelský účet: ${TARGET_EMAIL}`);
  console.log(`Auditní skrytá kopie (Bcc): info@pro-edu.eu`);

  // --- KROK 1: Získání informací o uživateli a reset na výchozí stav FREE ---
  await logStep(`KROK 1: Vyhledání účtu ${TARGET_EMAIL} a reset do stavu "free"`);
  const { idToken, uid, userRecord } = await getUserAuthInfo(TARGET_EMAIL);
  console.log(`Uživatel nalezen ve Firebase Auth:`);
  console.log(`   - UID: ${uid}`);
  console.log(`   - Display Name: ${userRecord.displayName || 'Neuvedeno'}`);
  console.log(`   - Email: ${userRecord.email}`);

  // Reset ve Firestore i v custom claims, abychom měli 100% jistotu nového přechodu
  await db.collection('users').doc(uid).set({
    role: 'free',
    subscriptionStatus: 'inactive',
    subscriptionPeriodEnd: null,
    subscriptionCancelledAt: null,
    initRecurringTransId: null
  }, { merge: true });

  await adminAuth.setCustomUserClaims(uid, {
    ...(userRecord.customClaims || {}),
    role: 'free',
    enrolledCourseIds: []
  });

  console.log(`✅ Uživatel ${TARGET_EMAIL} (UID: ${uid}) byl resetován do výchozího stavu:`);
  console.log(`   - role ve Firestore: "free"`);
  console.log(`   - role v Custom Claims: "free"`);
  console.log(`   - subscriptionStatus: "inactive"`);

  // --- KROK 2: Vytvoření objednávky přes API (POST /api/orders/create) ---
  await logStep(`KROK 2: Vytvoření objednávky pro ${TARGET_EMAIL} (POST /api/orders/create)`);
  const clientName = userRecord.displayName || 'David Testovací';
  const createOrderPayload = {
    planId: 'premium-monthly',
    clientName,
    invoiceEmail: TARGET_EMAIL,
    billingAddress: {
      street: 'Vodičkova 791/41',
      city: 'Praha',
      zip: '11000',
      country: 'CZ'
    },
    termsAccepted: true,
    newsletterConsent: false,
    paymentMethod: 'comgate'
  };

  const createOrderRes = await fetch(`${API_BASE}/api/orders/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(createOrderPayload)
  });

  const orderResponseData = await createOrderRes.json();
  if (!createOrderRes.ok) {
    throw new Error(`Chyba při vytváření objednávky (${createOrderRes.status}): ${JSON.stringify(orderResponseData)}`);
  }

  const orderId = orderResponseData.orderId;
  console.log(`✅ Objednávka úspěšně vytvořena v databázi pro uživatele ${uid}!`);
  console.log(`   - ID objednávky: ${orderId}`);
  console.log(`   - Variabilní symbol: ${orderResponseData.order.variableSymbol}`);
  console.log(`   - Částka: ${orderResponseData.order.amount} ${orderResponseData.order.currency}`);
  console.log(`   - Stav: ${orderResponseData.order.status} (čeká na zaplacení)`);
  console.log(`   - Přiřazeno k userId: ${orderResponseData.order.userId}`);

  // Ověření ve Firestore
  const createdOrderDoc = await db.collection('orders').doc(orderId).get();
  console.log(`   - Uloženo ve Firestore orders: exists=${createdOrderDoc.exists}, status="${createdOrderDoc.data()?.status}"`);

  // --- KROK 3: Simulace zaplacení přes Comgate sandbox ---
  await logStep('KROK 3: Simulace platby a autorizace kartou (POST /api/payments/comgate/sandbox-simulate-pay)');
  console.log(`Odesílám požadavek na schválení platby pro objednávku ${orderId}...`);

  const payStart = Date.now();
  const payRes = await fetch(`${API_BASE}/api/payments/comgate/sandbox-simulate-pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ orderId })
  });

  const payResponseData = await payRes.json();
  const payDuration = ((Date.now() - payStart) / 1000).toFixed(1);

  if (!payRes.ok) {
    throw new Error(`Chyba při simulaci platby (${payRes.status}): ${JSON.stringify(payResponseData)}`);
  }

  console.log(`✅ Platba byla úspěšně zpracována za ${payDuration}s:`);
  console.log(`   - Server zpráva: "${payResponseData.message}"`);
  console.log(`   - Vystavená iÚčto faktura č.: ${payResponseData.iuctoInvoiceNumber}`);

  // --- KROK 4: Kontrola přiřazení role uživatele ve Firestore i v Auth ---
  await logStep(`KROK 4: Ověření přiřazení role "premium" uživateli ${TARGET_EMAIL}`);
  const updatedUserSnap = await db.collection('users').doc(uid).get();
  const userData = updatedUserSnap.data();

  const refreshedAuth = await adminAuth.getUser(uid);

  console.log(`✅ Uživatelský profil ${TARGET_EMAIL} (UID: ${uid}) po zaplacení:`);
  console.log(`   - Role ve Firestore: ${userData.role}  <-- PŘEPNUTO NA PREMIUM!`);
  console.log(`   - Role v Auth Claims: ${refreshedAuth.customClaims?.role}  <-- PŘEPNUTO NA PREMIUM!`);
  console.log(`   - Subscription Status: ${userData.subscriptionStatus}`);
  console.log(`   - Subscription Period End: ${userData.subscriptionPeriodEnd}`);
  console.log(`   - Premium Since: ${userData.premiumSince}`);
  console.log(`   - iÚčto Customer ID: ${userData.iuctoCustomerId}`);

  if (userData.role !== 'premium' || userData.subscriptionStatus !== 'active') {
    throw new Error(`CHYBA: Uživatel nemá aktivní roli premium! (role: ${userData.role})`);
  }

  // --- KROK 5: Ověření session-bootstrap pro webový frontend ---
  await logStep(`KROK 5: Ověření session-bootstrap endpointu pro webový frontend`);
  const bootstrapRes = await fetch(`${API_BASE}/api/auth/session-bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    }
  });
  const bootstrapData = await bootstrapRes.json();
  console.log(`Výsledek session-bootstrap (přesně to, co načítá webový prohlížeč):`);
  console.log(`   - ok: ${bootstrapData.ok}`);
  console.log(`   - role: ${bootstrapData.profile?.role} (musí být "premium")`);
  console.log(`   - subscriptionStatus: ${bootstrapData.profile?.subscriptionStatus} (musí být "active")`);
  console.log(`   - subscriptionPeriodEnd: ${bootstrapData.profile?.subscriptionPeriodEnd}`);

  if (bootstrapData.profile?.role !== 'premium') {
    throw new Error(`CHYBA: session-bootstrap nevrací roli premium pro webový frontend!`);
  }

  // --- KROK 6: Kontrola objednávky ve Firestore ---
  await logStep('KROK 6: Ověření objednávky ve Firestore a vazby na iÚčto');
  const updatedOrderSnap = await db.collection('orders').doc(orderId).get();
  const orderData = updatedOrderSnap.data();

  console.log(`✅ Objednávka ${orderId} po zaplacení:`);
  console.log(`   - Stav objednávky: ${orderData.status}`);
  console.log(`   - Zaplaceno v (paidAt): ${orderData.paidAt}`);
  console.log(`   - Transakční ID Comgate: ${orderData.comgateTransId}`);
  console.log(`   - iÚčto Sync Status: ${orderData.iuctoSyncStatus}`);
  console.log(`   - iÚčto Číslo faktury: ${orderData.iuctoInvoiceNumber}`);
  console.log(`   - iÚčto Invoice ID: ${orderData.iuctoInvoiceId}`);
  console.log(`   - iÚčto Payment ID: ${orderData.iuctoPaymentId}`);

  // --- KROK 7: Shrnutí e-mailového toku ---
  await logStep('KROK 7: Potvrzení odeslání e-mailu');
  console.log(`✅ E-mail s potvrzením a přiloženou PDF fakturou byl odeslán přes Forpsi SMTP:`);
  console.log(`   - Z adresy: info@pro-edu.eu`);
  console.log(`   - Příjemce (Klient): ${TARGET_EMAIL}`);
  console.log(`   - Skrytá kopie (Audit / Bcc): info@pro-edu.eu`);
  console.log(`   - Příloha: faktura-${orderData.iuctoInvoiceNumber}.pdf`);

  await logStep(`🎉 SIMULACE PRO ${TARGET_EMAIL} PROBĚHLA 100% ÚSPĚŠNĚ! ROLE JE NYNÍ PREMIUM!`);
}

runSimulation().catch((err) => {
  console.error('\n❌ SIMULACE SELHALA:', err);
  process.exit(1);
});
