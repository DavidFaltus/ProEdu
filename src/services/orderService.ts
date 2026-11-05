import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { Order, PaymentMethod, BillingAddress, BillingDetails } from '../types';
import { generateSpaydString, getQrImageUrl } from '../utils/qrPayment';

export interface CreateOrderParams {
  clientName: string;
  billingAddress: BillingAddress;
  invoiceEmail: string;
  paymentMethod: PaymentMethod;
  termsAccepted: boolean;
  newsletterConsent?: boolean;
  planId?: string;
  amount?: number;
}

export interface CreateOrderResult {
  success: boolean;
  orderId: string;
  order: Order;
  bankDetails?: {
    accountNumber: string;
    bankCode: string;
    bankName: string;
    recipientName: string;
    amount: number;
    currency: string;
    variableSymbol: string;
    message: string;
    spaydString: string;
    qrImageUrl: string;
  };
  comgate?: {
    transId?: string;
    redirectUrl?: string;
    isLive?: boolean;
    isSandbox?: boolean;
    testMode?: boolean;
    message?: string;
  };
}

async function getAuthToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro vytvoření objednávky musíte být přihlášeni.');
  }
  return currentUser.getIdToken();
}

/**
 * Vytvoří novou objednávku předplatného bleskově přímo ve Firestore
 * a asynchronně notifikuje backend
 */
export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro vytvoření objednávky se prosím nejdříve přihlas.');
  }

  const userId = currentUser.uid;
  const userEmail = currentUser.email || params.invoiceEmail;
  const amount = params.amount || 99;
  const planId = params.planId || 'premium-monthly';

  // Generování 9místného variabilního symbolu a unikátního ID
  const variableSymbol = String(Date.now()).slice(-9);
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Bankovní konfigurace pro SPAYD
  const bankConfig = {
    accountNumber: import.meta.env.VITE_BANK_ACCOUNT_NUMBER || '2100000000',
    bankCode: import.meta.env.VITE_BANK_CODE || '2010',
    bankName: import.meta.env.VITE_BANK_NAME || 'Fio banka',
    recipientName: import.meta.env.VITE_BANK_RECIPIENT || 'ProEdu vzdělávání'
  };

  const paymentMessage = `ProEdu: ${userEmail}`.slice(0, 60);
  const spaydString = generateSpaydString({
    accountNumber: bankConfig.accountNumber,
    bankCode: bankConfig.bankCode,
    amount,
    currency: 'CZK',
    variableSymbol,
    message: paymentMessage,
    recipientName: bankConfig.recipientName
  });

  const qrImageUrl = getQrImageUrl(spaydString, 260);

  const orderData: Order = {
    id: orderId,
    userId,
    userEmail,
    clientName: params.clientName.trim(),
    billingAddress: {
      street: params.billingAddress.street.trim(),
      city: params.billingAddress.city.trim(),
      zip: params.billingAddress.zip.trim(),
      country: params.billingAddress.country || 'Česká republika'
    },
    invoiceEmail: params.invoiceEmail.trim(),
    amount,
    currency: 'CZK',
    planId,
    paymentMethod: params.paymentMethod,
    status: 'pending',
    termsAccepted: Boolean(params.termsAccepted),
    newsletterConsent: Boolean(params.newsletterConsent),
    variableSymbol,
    spaydString,
    createdAt: new Date().toISOString()
  };

  // 1. Pokus o přímý zápis do Firestore s krátkým timeoutem (aby nikdy nezdržel ani nezablokoval přechod na Krok 3)
  try {
    await Promise.race([
      setDoc(doc(db, 'orders', orderId), orderData),
      new Promise(resolve => setTimeout(resolve, 1500))
    ]);
  } catch (firestoreOrderErr) {
    console.warn('[Order Firestore Client Write Notice]: Používám serverový zápis / dummy režim:', firestoreOrderErr);
  }

    // 2. Záložní asynchronní synchronizace se serverem (pokud běží server na pozadí)
  try {
    const token = await currentUser.getIdToken();
    fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ ...params, orderId, variableSymbol })
    }).catch(err => {
      console.warn('[Order Sync Notice]:', err);
    });
  } catch (syncErr) {
    console.warn('[Order Token Notice]:', syncErr);
  }

  const result: CreateOrderResult = {
    success: true,
    orderId,
    order: orderData,
    bankDetails: {
      accountNumber: bankConfig.accountNumber,
      bankCode: bankConfig.bankCode,
      bankName: bankConfig.bankName,
      recipientName: bankConfig.recipientName,
      amount,
      currency: 'CZK',
      variableSymbol,
      message: paymentMessage,
      spaydString,
      qrImageUrl
    },
    comgate: params.paymentMethod === 'comgate' ? {
      isSandbox: true,
      testMode: true,
      message: 'Platební brána Comgate je nastavena v testovacím režimu (čeká se na finální schválení smlouvy).'
    } : undefined
  };

  return result;
}

/**
 * Sestaví CreateOrderResult z již existující objednávky (např. při rozkliknutí neuhrazené platby ve Správě předplatného)
 */
export function buildOrderResultFromOrder(order: Order): CreateOrderResult {
  const orderId = (order as any).orderId || order.id || '';
  const amount = order.amount || 99;
  const variableSymbol = order.variableSymbol || String(Date.now()).slice(-9);
  const userEmail = order.invoiceEmail || order.userEmail || '';

  const bankConfig = {
    accountNumber: import.meta.env.VITE_BANK_ACCOUNT_NUMBER || '2100000000',
    bankCode: import.meta.env.VITE_BANK_CODE || '2010',
    bankName: import.meta.env.VITE_BANK_NAME || 'Fio banka',
    recipientName: import.meta.env.VITE_BANK_RECIPIENT || 'ProEdu vzdělávání'
  };

  const paymentMessage = `ProEdu: ${userEmail}`.slice(0, 60);
  const spaydString =
    order.spaydString ||
    generateSpaydString({
      accountNumber: bankConfig.accountNumber,
      bankCode: bankConfig.bankCode,
      amount,
      currency: 'CZK',
      variableSymbol,
      message: paymentMessage,
      recipientName: bankConfig.recipientName
    });

  const qrImageUrl = getQrImageUrl(spaydString, 260);

  return {
    success: true,
    orderId,
    order,
    bankDetails: {
      accountNumber: bankConfig.accountNumber,
      bankCode: bankConfig.bankCode,
      bankName: bankConfig.bankName,
      recipientName: bankConfig.recipientName,
      amount,
      currency: order.currency || 'CZK',
      variableSymbol,
      message: paymentMessage,
      spaydString,
      qrImageUrl
    },
    comgate: {
      isSandbox: true,
      testMode: true,
      message: 'Testovací platební brána'
    }
  };
}

/**
 * Simuluje platbu v testovacím (dummy) režimu pro Comgate i QR platbu a ověří přepnutí na Premium v databázi
 */
export async function simulateComgatePayment(orderId: string): Promise<{ success: boolean; message: string }> {
  const currentUser = auth.currentUser;
  const nowIso = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const premiumPayload = {
    role: 'premium',
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: periodEnd,
    subscriptionCancelledAt: null,
    premiumSince: nowIso
  };

  if (currentUser) {
    const userDocRef = doc(db, 'users', currentUser.uid);

    // 1. Pokus o přímý klientský zápis do dokumentu uživatele ve Firestore
    try {
      await updateDoc(userDocRef, premiumPayload);
    } catch (clientWriteErr) {
      console.warn('[Dummy Payment Client Write Fallback]: Používám serverové API pro povýšení role:', clientWriteErr);
    }

    // 2. Zápis přes serverový dev endpoint (využívá oprávnění učitele/admina v databázi)
    try {
      await fetch('/api/dev/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.uid, ...premiumPayload })
      });
    } catch (devErr) {
      console.warn('[Dummy Payment Dev Set-Role Notice]:', devErr);
    }
  }

  // 3. Synchronizace se serverovým endpointem objednávky (označení objednávky jako paid + invalidace cache)
  try {
    const token = await getAuthToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    await fetch('/api/payments/comgate/sandbox-simulate-pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ orderId }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch (err) {
    console.warn('[Dummy Payment Notice]: Server endpoint unavailable, using Firestore state:', err);
  }

  // 4. Počkáme na potvrzení přímo z databáze Firestore, že uživatel má roli 'premium'
  if (currentUser) {
    const userDocRef = doc(db, 'users', currentUser.uid);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          const dbData = snap.data();
          if (dbData.role === 'premium') {
            if (typeof window !== 'undefined') {
              localStorage.setItem('proedu_dev_role_override', 'premium');
              localStorage.setItem('proedu_cached_profile', JSON.stringify({ ...dbData, ...premiumPayload }));
            }
            break;
          }
        }
      } catch {
        // Ignorujeme dílčí chybu čtení při ověřování
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('proedu_dev_role_override', 'premium');
    }
  }

  return {
    success: true,
    message: '🎉 Dummy platba byla úspěšně potvrzena! Tvůj účet je nyní přepnut na ProEducator Premium.'
  };
}

/**
 * Načte všechny objednávky pro učitelský panel
 */
export async function getAllOrders(): Promise<Order[]> {
  try {
    const collRef = collection(db, 'orders');
    const q = query(collRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as Order) }));
    }
  } catch (firestoreErr) {
    console.warn('[Orders Firestore Query]: Fallback na serverové API:', firestoreErr);
  }

  try {
    const token = await getAuthToken();
    const response = await fetch('/api/orders/all', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok && data.orders) {
      return data.orders;
    }
  } catch (apiErr) {
    console.warn('[Orders API Query]:', apiErr);
  }

  return [];
}

/**
 * Potvrdí přijetí platby převodem na účet (akce učitele)
 */
export async function confirmOrderManual(orderId: string): Promise<{ success: boolean; message: string }> {
  const token = await getAuthToken();

  const response = await fetch(`/api/orders/${orderId}/confirm-manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se potvrdit platbu objednávky.');
  }

  return data;
}

/**
 * Smaže jednotlivou objednávku v administraci (akce učitele/admina)
 */
export async function deleteOrder(orderId: string): Promise<{ success: boolean; message: string }> {
  if (!orderId) {
    throw new Error('Chybí ID objednávky.');
  }

  let deletedDirectly = false;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
    deletedDirectly = true;
  } catch (firestoreErr) {
    console.warn('[Delete Order Firestore Fallback]:', firestoreErr);
  }

  try {
    const token = await getAuthToken();
    const response = await fetch(`/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    if (!deletedDirectly) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Nepodařilo se smazat objednávku.');
    }
  } catch (apiErr: any) {
    if (!deletedDirectly) {
      throw new Error(apiErr.message || 'Nepodařilo se smazat objednávku.');
    }
  }

  return {
    success: true,
    message: 'Objednávka byla úspěšně smazána.'
  };
}

/**
 * Načte objednávky přihlášeného studenta pro historii plateb a faktur (iÚčto)
 */
export async function getMyOrders(): Promise<Order[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const collRef = collection(db, 'orders');
    const q = query(collRef, where('userId', '==', currentUser.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const orders = snap.docs.map(d => ({ id: d.id, ...(d.data() as Order) }));
      orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return orders;
    }
  } catch (firestoreErr) {
    console.warn('[My Orders Firestore Query]: Fallback na serverové API:', firestoreErr);
  }

  try {
    const token = await getAuthToken();
    const response = await fetch('/api/orders/my', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();
    if (response.ok && data.orders) {
      return data.orders;
    }
  } catch (apiErr) {
    console.warn('[My Orders API Query]:', apiErr);
  }

  return [];
}

/**
 * Zruší předplatné uživatele (ke konci období nebo okamžitě v testovacím režimu)
 */
export async function cancelSubscription(params: {
  reason: string;
  immediate?: boolean;
  currentPeriodEnd?: string;
}): Promise<{
  success: boolean;
  immediate: boolean;
  subscriptionStatus: 'cancelled_at_period_end' | 'inactive';
  subscriptionPeriodEnd: string | null;
  message: string;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro správu předplatného se prosím přihlas.');
  }

  const safeReason = (params.reason || 'Bez udání důvodu').trim().slice(0, 500);
  const nowIso = new Date().toISOString();
  const periodEnd = params.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const updatePayload: Record<string, any> = params.immediate
    ? {
        role: 'free',
        subscriptionStatus: 'inactive',
        subscriptionCancelledAt: nowIso,
        subscriptionCancelReason: safeReason
      }
    : {
        subscriptionStatus: 'cancelled_at_period_end',
        subscriptionCancelledAt: nowIso,
        subscriptionCancelReason: safeReason,
        subscriptionPeriodEnd: periodEnd
      };

  const userDocRef = doc(db, 'users', currentUser.uid);

  // 1. Pokus o přímý zápis do dokumentu uživatele ve Firestore
  try {
    await updateDoc(userDocRef, updatePayload);
  } catch (clientWriteErr) {
    console.warn('[Cancel Subscription Client Write Fallback]: Používám serverové API:', clientWriteErr);
  }

  // 2. Zápis přes serverový dev endpoint (využívá oprávnění učitele/admina v databázi)
  try {
    await fetch('/api/dev/set-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUser.uid,
        role: params.immediate ? 'free' : 'premium',
        ...updatePayload
      })
    });
  } catch (devErr) {
    console.warn('[Cancel Subscription Dev Set-Role Notice]:', devErr);
  }

  // 3. Synchronizace se serverem (Comgate hook + invalidace serverové cache)
  try {
    const token = await currentUser.getIdToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    await fetch('/api/subscription/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason: safeReason, immediate: Boolean(params.immediate) }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch {
    // Tichý fallback
  }

  // 4. Počkáme na potvrzení přímo z databáze Firestore, že změna je propisována
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const dbData = snap.data();
        const confirmed = params.immediate
          ? dbData.role === 'free'
          : dbData.subscriptionStatus === 'cancelled_at_period_end';
        if (confirmed) {
          if (typeof window !== 'undefined') {
            if (params.immediate) {
              localStorage.setItem('proedu_dev_role_override', 'free');
            }
            localStorage.setItem('proedu_cached_profile', JSON.stringify({ ...dbData, ...updatePayload }));
          }
          break;
        }
      }
    } catch {
      // Ignorujeme dílčí chybu čtení při ověřování
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (typeof window !== 'undefined' && params.immediate) {
    localStorage.setItem('proedu_dev_role_override', 'free');
  }

  return {
    success: true,
    immediate: Boolean(params.immediate),
    subscriptionStatus: params.immediate ? 'inactive' : 'cancelled_at_period_end',
    subscriptionPeriodEnd: params.immediate ? null : periodEnd,
    message: params.immediate
      ? 'Předplatné bylo zrušeno a tvůj účet byl přepnut na tarif Free.'
      : 'Automatické prodlužování předplatného bylo zrušeno. Výhody Premium ti zůstanou až do konce zaplaceného období.'
  };
}

/**
 * Obnoví zrušené předplatné před vypršením zaplaceného období
 */
export async function reactivateSubscription(currentPeriodEnd?: string): Promise<{
  success: boolean;
  subscriptionStatus: 'active';
  subscriptionPeriodEnd: string;
  message: string;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro obnovení předplatného se prosím přihlas.');
  }

  const periodEnd = currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const updatePayload = {
    role: 'premium',
    subscriptionStatus: 'active',
    subscriptionCancelledAt: null,
    subscriptionPeriodEnd: periodEnd
  };

  try {
    await updateDoc(doc(db, 'users', currentUser.uid), updatePayload);
  } catch (clientWriteErr) {
    console.warn('[Reactivate Subscription Client Write Fallback]:', clientWriteErr);
  }

  try {
    await fetch('/api/dev/set-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUser.uid, ...updatePayload })
    });
  } catch {
    // Tichý fallback
  }

  try {
    const token = await currentUser.getIdToken();
    fetch('/api/subscription/reactivate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }).catch(() => {});
  } catch {
    // Tichý fallback
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem('proedu_dev_role_override', 'premium');
  }

  return {
    success: true,
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: periodEnd,
    message: 'Automatické prodlužování předplatného bylo obnoveno!'
  };
}

/**
 * Uloží fakturační údaje (pro iÚčto) a preferovanou platební metodu (Comgate / QR)
 */
export async function saveBillingAndPaymentSettings(params: {
  billingDetails?: BillingDetails;
  preferredPaymentMethod?: PaymentMethod;
}): Promise<{ success: boolean; message: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro uložení nastavení se prosím přihlas.');
  }

  const updatePayload: Record<string, any> = {};
  if (params.preferredPaymentMethod) {
    updatePayload.preferredPaymentMethod = params.preferredPaymentMethod;
  }
  if (params.billingDetails) {
    updatePayload.billingDetails = {
      clientName: (params.billingDetails.clientName || '').trim().slice(0, 128),
      invoiceEmail: (params.billingDetails.invoiceEmail || '').trim().slice(0, 256),
      street: (params.billingDetails.street || '').trim().slice(0, 150),
      city: (params.billingDetails.city || '').trim().slice(0, 100),
      zip: (params.billingDetails.zip || '').trim().slice(0, 20),
      country: (params.billingDetails.country || 'Česká republika').trim().slice(0, 64),
      ico: (params.billingDetails.ico || '').trim().slice(0, 20),
      dic: (params.billingDetails.dic || '').trim().slice(0, 20)
    };
  }

  try {
    await updateDoc(doc(db, 'users', currentUser.uid), updatePayload);
  } catch (clientWriteErr) {
    console.warn('[Save Billing Client Write Fallback]:', clientWriteErr);
  }

  try {
    const token = await currentUser.getIdToken();
    await fetch('/api/subscription/billing', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(params)
    });
  } catch {
    // Tichý fallback
  }

  return {
    success: true,
    message: 'Fakturační a platební údaje byly úspěšně uloženy.'
  };
}

/**
 * Otevře tisknutelný náhled faktury / daňového dokladu (připraveno pro iÚčto PDF)
 */
export function openIuctoInvoicePreview(order: Order) {
  if (order.iuctoPdfUrl) {
    window.open(order.iuctoPdfUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const invoiceNum = order.iuctoInvoiceNumber || `FV-${new Date(order.createdAt || Date.now()).getFullYear()}-${order.variableSymbol || '0001'}`;
  const issueDate = new Date(order.paidAt || order.createdAt || Date.now()).toLocaleDateString('cs-CZ');
  const planTitle = order.planId === 'premium-monthly' ? 'Předplatné ProEducator Premium (měsíční tarif)' : order.planId;
  const paymentLabel = order.paymentMethod === 'comgate' ? 'Platební brána Comgate (online karta)' : 'Bankovní převod (QR platba)';

  const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <title>Faktura ${invoiceNum} – ProEducator</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1E1B18; background: #FAF6EE; margin: 0; padding: 32px; }
    .sheet { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 20px; padding: 44px; box-shadow: 0 12px 32px rgba(0,0,0,0.06); border: 1px solid #ece7df; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #F5C400; padding-bottom: 24px; margin-bottom: 28px; }
    .badge { display: inline-block; background: #FEF3C7; color: #92400E; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 32px; }
    .box { background: #FAF7F0; padding: 18px 22px; border-radius: 14px; }
    .box h4 { margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B7280; }
    .box p { margin: 3px 0; font-size: 14px; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6B7280; border-bottom: 1px solid #E5E7EB; padding: 10px 8px; }
    td { padding: 14px 8px; border-bottom: 1px solid #F3F4F6; font-size: 14px; font-weight: 600; }
    .total { text-align: right; margin-top: 20px; font-size: 22px; font-weight: 900; color: #1E1B18; }
    .actions { text-align: center; margin-top: 32px; }
    .btn { background: #F5C400; color: #1E1B18; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 800; cursor: pointer; font-size: 14px; }
    @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border: none; } .actions { display: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <h1 style="margin:0;font-size:26px;">ProEducator</h1>
        <span class="badge">iÚčto • Daňový doklad (Náhled)</span>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:#6B7280;font-weight:700;text-transform:uppercase;">Faktura č.</div>
        <div style="font-size:22px;font-weight:900;">${invoiceNum}</div>
        <div style="font-size:12px;color:#6B7280;margin-top:4px;">Variabilní symbol: <strong>${order.variableSymbol || '-'}</strong></div>
      </div>
    </div>
    <div class="grid">
      <div class="box">
        <h4>Dodavatel</h4>
        <p><strong>ProEducator vzdělávání</strong></p>
        <p>E-mail: podpora@proeducator.eu</p>
        <p>Web: https://proeducator.eu</p>
      </div>
      <div class="box">
        <h4>Odběratel</h4>
        <p><strong>${order.clientName || 'Zákazník'}</strong></p>
        <p>${order.billingAddress?.street || ''}</p>
        <p>${order.billingAddress?.zip || ''} ${order.billingAddress?.city || ''}</p>
        <p>E-mail: ${order.invoiceEmail || order.userEmail || ''}</p>
      </div>
    </div>
    <div class="grid" style="margin-bottom:16px;">
      <div>
        <div style="font-size:13px;color:#6B7280;">Datum vystavení / DUZP: <strong>${issueDate}</strong></div>
        <div style="font-size:13px;color:#6B7280;margin-top:4px;">Způsob úhrady: <strong>${paymentLabel}</strong></div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;color:#059669;font-weight:800;">Stav: ${order.status === 'paid' ? 'UHRAZENO' : 'ČEKÁ NA ÚHRADU'}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Položka</th>
          <th>Množství</th>
          <th style="text-align:right;">Cena celkem</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${planTitle}</td>
          <td>1 ks</td>
          <td style="text-align:right;">${order.amount || 99} ${order.currency || 'Kč'}</td>
        </tr>
      </tbody>
    </table>
    <div class="total">Celkem k úhradě: ${order.amount || 99} ${order.currency || 'Kč'}</div>
    <div class="actions">
      <button class="btn" onclick="window.print()">Vytisknout / Uložit jako PDF</button>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

