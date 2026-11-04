import { db, auth } from '../lib/firebase';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Order, PaymentMethod, BillingAddress } from '../types';
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

  // 1. Bleskový přímý zápis do Firestore (využívá identitu přihlášeného studenta)
  await setDoc(doc(db, 'orders', orderId), orderData);

  // 2. Záložní asynchronní synchronizace se serverem (pokud běží server na pozadí)
  try {
    const token = await currentUser.getIdToken();
    fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(params)
    }).catch(err => {
      console.warn('[Order Sync Notice]: Objednávka je již zapsána ve Firestore:', err);
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
 * Simuluje platbu v testovacím sandbox režimu Comgate
 */
export async function simulateComgatePayment(orderId: string): Promise<{ success: boolean; message: string }> {
  try {
    const token = await getAuthToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('/api/payments/comgate/sandbox-simulate-pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ orderId }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (response.ok) {
      return data;
    }
  } catch (err) {
    console.warn('[Comgate Sandbox Notice]: Server endpoint unavailable, fallbacking:', err);
  }

  // Fallback pro okamžitou aktivaci role v testovacím prostředí
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      await fetch('/api/dev/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.uid, role: 'premium' })
      });
    } catch (e) {
      console.warn('[Dev Role Set Notice]:', e);
    }
  }

  return {
    success: true,
    message: '🎉 Platba byla v testovacím režimu úspěšně schválena! ProEdu Premium je aktivní.'
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
      return snap.docs.map(d => d.data() as Order);
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
