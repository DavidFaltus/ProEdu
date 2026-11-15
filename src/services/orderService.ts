import { db, auth } from '../lib/firebase';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { Order, PaymentMethod, BillingAddress, BillingDetails } from '../types';
import { generateSpaydString, getQrImageUrl } from '../utils/qrPayment';
import { sanitizeSafeUrl } from '../utils/svgUtils';

export interface CreateOrderParams {
  clientName: string;
  billingAddress: BillingAddress;
  invoiceEmail: string;
  ico?: string;
  dic?: string;
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
    throw new Error('Pro tuto akci musíte být přihlášeni.');
  }
  return currentUser.getIdToken();
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Vytvoří novou objednávku výhradně přes autorizované serverové API (/api/orders/create).
 * Cenu a ID objednávky určuje server z katalogu.
 */
export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro vytvoření objednávky se prosím nejdříve přihlas.');
  }

  const token = await currentUser.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        clientName: params.clientName.trim(),
        billingAddress: {
          street: params.billingAddress.street.trim(),
          city: params.billingAddress.city.trim(),
          zip: params.billingAddress.zip.trim(),
          country: params.billingAddress.country || 'Česká republika'
        },
        invoiceEmail: params.invoiceEmail.trim(),
        ...(params.ico?.trim() ? { ico: params.ico.trim().slice(0, 20) } : {}),
        ...(params.dic?.trim() ? { dic: params.dic.trim().slice(0, 20) } : {}),
        paymentMethod: params.paymentMethod,
        termsAccepted: Boolean(params.termsAccepted),
        newsletterConsent: Boolean(params.newsletterConsent),
        planId: params.planId || 'premium-monthly'
      }),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('Vypršel časový limit při vytváření objednávky. Zkus to prosím znovu.');
    }
    throw new Error('Nepodařilo se spojit se serverem pro vytvoření objednávky.');
  }
  clearTimeout(timeoutId);

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.order || !(data?.orderId || data?.order?.id)) {
    throw new Error(data?.error || 'Nepodařilo se vytvořit objednávku na serveru.');
  }

  const serverOrder: Order = data.order;
  const orderId: string = data.orderId || serverOrder.id || '';

  return {
    success: true,
    orderId,
    order: { ...serverOrder, id: orderId },
    ...(data.bankDetails ? { bankDetails: data.bankDetails } : {}),
    ...(data.comgate ? { comgate: data.comgate } : {})
  };
}

/**
 * Sestaví CreateOrderResult z již existující objednávky (např. při rozkliknutí neuhrazené platby ve Správě předplatného).
 * Zachovává příznaky live vs sandbox Comgate brány.
 */
export function buildOrderResultFromOrder(order: Order): CreateOrderResult {
  const orderId = (order as any).orderId || order.id || '';
  const amount = order.amount || 99;
  const variableSymbol = order.variableSymbol || '';
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
    (variableSymbol
      ? generateSpaydString({
          accountNumber: bankConfig.accountNumber,
          bankCode: bankConfig.bankCode,
          amount,
          currency: 'CZK',
          variableSymbol,
          message: paymentMessage,
          recipientName: bankConfig.recipientName
        })
      : '');

  const qrImageUrl = getQrImageUrl(spaydString, 260);
  const safeRedirectUrl = sanitizeSafeUrl(order.comgateRedirectUrl) || undefined;
  const isLiveComgate = !order.isSandbox && Boolean(safeRedirectUrl);
  const isSandbox = Boolean(order.isSandbox ?? !isLiveComgate);

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
      ...(order.comgateTransId ? { transId: order.comgateTransId } : {}),
      ...(safeRedirectUrl ? { redirectUrl: safeRedirectUrl } : {}),
      isLive: isLiveComgate,
      isSandbox,
      testMode: isSandbox,
      message: isLiveComgate
        ? 'Dokonči platbu bezpečně přes platební bránu Comgate.'
        : 'Testovací platební brána'
    }
  };
}

/**
 * Simuluje platbu pouze v lokálním vývojovém režimu přes backend sandbox endpoint.
 */
export async function simulateComgatePayment(orderId: string): Promise<{ success: boolean; message: string }> {
  if (!import.meta.env.DEV) {
    throw new Error('Testovací simulace platby není v produkčním prostředí povolena.');
  }

  if (!orderId) {
    throw new Error('Chybí ID objednávky.');
  }

  const token = await getAuthToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch('/api/payments/comgate/sandbox-simulate-pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ orderId }),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw new Error(err?.name === 'AbortError'
      ? 'Vypršel časový limit testovací platby.'
      : 'Nepodařilo se spojit se serverem pro potvrzení platby.');
  }
  clearTimeout(timeoutId);

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok && !data?.success) {
    throw new Error(data?.error || 'Testovací simulaci platby se nepodařilo potvrdit.');
  }

  return {
    success: true,
    message: data.message || '🎉 Testovací platba byla úspěšně potvrzena! Tvůj účet je nyní přepnut na ProEducator Premium.'
  };
}

/**
 * Načte všechny objednávky pro učitelský panel
 */
export async function getAllOrders(): Promise<Order[]> {
  try {
    const token = await getAuthToken();
    const response = await fetch('/api/orders/all', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.orders)) {
      return data.orders;
    }
    if (!response.ok) {
      throw new Error(data.error || 'Nepodařilo se načíst objednávky.');
    }
  } catch (apiErr) {
    console.warn('[Orders API Query]: Fallback na Firestore čtení:', apiErr);
  }

  try {
    const collRef = collection(db, 'orders');
    const q = query(collRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Order) }));
  } catch (firestoreErr) {
    console.warn('[Orders Firestore Query]:', firestoreErr);
  }

  return [];
}

/**
 * Potvrdí přijetí platby převodem na účet (akce učitele)
 */
export async function confirmOrderManual(orderId: string): Promise<{ success: boolean; message: string }> {
  const token = await getAuthToken();

  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/confirm-manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se potvrdit platbu objednávky.');
  }

  return data;
}

/**
 * Smaže neuhrazenou objednávku v administraci výhradně přes backend (chrání účetní stopu).
 */
export async function deleteOrder(orderId: string): Promise<{ success: boolean; message: string }> {
  if (!orderId) {
    throw new Error('Chybí ID objednávky.');
  }

  const token = await getAuthToken();
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se smazat objednávku.');
  }

  return {
    success: true,
    message: data.message || 'Objednávka byla úspěšně smazána.'
  };
}

/**
 * Načte objednávky přihlášeného studenta pro historii plateb a faktur (iÚčto)
 */
export async function getMyOrders(): Promise<Order[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const token = await getAuthToken();
    const response = await fetch('/api/orders/my', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.orders)) {
      return data.orders;
    }
  } catch (apiErr) {
    console.warn('[My Orders API Query]: Fallback na Firestore čtení:', apiErr);
  }

  try {
    const collRef = collection(db, 'orders');
    const q = query(collRef, where('userId', '==', currentUser.uid));
    const snap = await getDocs(q);
    const orders = snap.docs.map(d => ({ id: d.id, ...(d.data() as Order) }));
    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return orders;
  } catch (firestoreErr) {
    console.warn('[My Orders Firestore Query]:', firestoreErr);
  }

  return [];
}

/**
 * Zruší předplatné uživatele výhradně přes serverový endpoint /api/subscription/cancel.
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
  const token = await getAuthToken();
  const safeReason = (params.reason || 'Bez udání důvodu').trim().slice(0, 500);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let res: Response;
  try {
    res = await fetch('/api/subscription/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason: safeReason, immediate: Boolean(params.immediate) }),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw new Error(err?.name === 'AbortError'
      ? 'Vypršel časový limit při rušení předplatného.'
      : 'Nepodařilo se spojit se serverem pro zrušení předplatného.');
  }
  clearTimeout(timeoutId);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Nepodařilo se zrušit předplatné.');
  }

  return {
    success: true,
    immediate: Boolean(data.immediate ?? params.immediate),
    subscriptionStatus: data.subscriptionStatus || (params.immediate ? 'inactive' : 'cancelled_at_period_end'),
    subscriptionPeriodEnd: data.subscriptionPeriodEnd ?? (params.immediate ? null : params.currentPeriodEnd ?? null),
    message:
      data.message ||
      (params.immediate
        ? 'Předplatné bylo okamžitě ukončeno.'
        : 'Automatické prodlužování předplatného bylo zrušeno. Výhody Premium ti zůstanou až do konce zaplaceného období.')
  };
}

/**
 * Obnoví zrušené předplatné před vypršením zaplaceného období výhradně přes server.
 */
export async function reactivateSubscription(_currentPeriodEnd?: string): Promise<{
  success: boolean;
  subscriptionStatus: 'active';
  subscriptionPeriodEnd: string;
  message: string;
}> {
  const token = await getAuthToken();
  const res = await fetch('/api/subscription/reactivate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Předplatné nelze obnovit. Pokud již skončilo, založ prosím novou objednávku.');
  }

  return {
    success: true,
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: data.subscriptionPeriodEnd || '',
    message: data.message || 'Předplatné ProEducator Premium bylo úspěšně obnoveno!'
  };
}

/**
 * Ověří na serveru, zda placené období předplatného již neuplynulo (fail-closed při chybě serveru).
 */
export async function checkSubscriptionExpiry(): Promise<{
  expired: boolean;
  role: string;
  subscriptionStatus: string;
  message?: string;
}> {
  const token = await getAuthToken();
  const res = await fetch('/api/subscription/check-expiry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Nepodařilo se ověřit platnost předplatného na serveru.');
  }

  return data;
}

/**
 * Uloží fakturační údaje (pro iÚčto) a preferovanou platební metodu přes autorizované serverové API.
 */
export async function saveBillingAndPaymentSettings(params: {
  billingDetails?: BillingDetails;
  preferredPaymentMethod?: PaymentMethod;
}): Promise<{ success: boolean; message: string }> {
  const token = await getAuthToken();
  const payload: {
    billingDetails?: BillingDetails;
    preferredPaymentMethod?: PaymentMethod;
  } = {};

  if (params.preferredPaymentMethod) {
    payload.preferredPaymentMethod = params.preferredPaymentMethod;
  }
  if (params.billingDetails) {
    payload.billingDetails = {
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

  const response = await fetch('/api/subscription/billing', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se uložit fakturační údaje.');
  }

  return {
    success: true,
    message: data.message || 'Fakturační a platební údaje byly úspěšně uloženy.'
  };
}

/**
 * Stáhne nebo otevře PDF fakturu z iÚčta přes autorizovaný backend proxy.
 * Pokud objednávka ještě nemá iÚčto doklad, otevře zabezpečený HTML náhled.
 */
export async function downloadOrderInvoicePdf(order: Order): Promise<void> {
  const orderId = (order as any).orderId || order.id;
  if (!order.iuctoInvoiceId || !orderId) {
    openIuctoInvoicePreview(order);
    return;
  }

  const token = await getAuthToken();
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice.pdf`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Nepodařilo se stáhnout PDF faktury z iÚčta.');
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `faktura-${order.iuctoInvoiceNumber || order.variableSymbol || orderId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

/**
 * Ruční opakování / dovystavení faktury v iÚčtu (akce učitele/admina)
 */
export async function retryOrderIuctoSync(
  orderId: string,
  sendEmail: boolean = false
): Promise<{ success: boolean; iuctoInvoiceId?: string; iuctoInvoiceNumber?: string; message: string }> {
  const token = await getAuthToken();
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/iucto-retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ sendEmail })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se vystavit fakturu v iÚčtu.');
  }
  return data;
}

/**
 * Stornuje / refunduje zaplacenou objednávku a vystaví dobropis v iÚčtu (akce učitele/admina)
 */
export async function refundOrderWithCreditNote(
  orderId: string,
  reason: string
): Promise<{ success: boolean; creditNote?: any; message: string }> {
  const token = await getAuthToken();
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ reason, sendEmailViaIucto: true })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se stornovat objednávku a vystavit dobropis.');
  }
  return data;
}

/**
 * Ověří stav napojení na iÚčto API (akce učitele/admina)
 */
export async function getIuctoStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  companyName?: string | null;
  isVatPayer?: boolean;
  selectedBankAccountId?: number;
  bankAccounts?: Array<{ id: number; name: string; currency: string }>;
  sandboxEnabled?: boolean;
  comgateTestMode?: boolean;
  error?: string;
}> {
  const token = await getAuthToken();
  const response = await fetch('/api/iucto/status', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.json();
}

/**
 * Otevře tisknutelný náhled faktury / daňového dokladu s plným HTML escapováním všech vstupů.
 */
export function openIuctoInvoicePreview(order: Order) {
  const safePdfUrl = sanitizeSafeUrl(order.iuctoPdfUrl);
  if (safePdfUrl) {
    window.open(safePdfUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const invoiceNum = escapeHtml(
    order.iuctoInvoiceNumber || `FV-${new Date(order.createdAt || Date.now()).getFullYear()}-${order.variableSymbol || '0001'}`
  );
  const issueDate = escapeHtml(new Date(order.paidAt || order.createdAt || Date.now()).toLocaleDateString('cs-CZ'));
  const planTitle = escapeHtml(
    order.planId === 'premium-monthly' ? 'Předplatné ProEducator Premium (měsíční tarif)' : order.planId
  );
  const paymentLabel = escapeHtml(
    order.paymentMethod === 'comgate' ? 'Platební brána Comgate (online karta)' : 'Bankovní převod (QR platba)'
  );
  const safeVarSym = escapeHtml(order.variableSymbol || '-');
  const safeClientName = escapeHtml(order.clientName || 'Zákazník');
  const safeStreet = escapeHtml(order.billingAddress?.street || '');
  const safeZip = escapeHtml(order.billingAddress?.zip || '');
  const safeCity = escapeHtml(order.billingAddress?.city || '');
  const safeEmail = escapeHtml(order.invoiceEmail || order.userEmail || '');
  const safeAmount = escapeHtml(order.amount || 99);
  const safeCurrency = escapeHtml(order.currency || 'Kč');
  const statusLabel = escapeHtml(
    order.status === 'paid'
      ? 'UHRAZENO'
      : order.status === 'refunded'
        ? 'REFUNDOVÁNO'
        : 'ČEKÁ NA ÚHRADU'
  );

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
        <div style="font-size:12px;color:#6B7280;margin-top:4px;">Variabilní symbol: <strong>${safeVarSym}</strong></div>
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
        <p><strong>${safeClientName}</strong></p>
        <p>${safeStreet}</p>
        <p>${safeZip} ${safeCity}</p>
        <p>E-mail: ${safeEmail}</p>
      </div>
    </div>
    <div class="grid" style="margin-bottom:16px;">
      <div>
        <div style="font-size:13px;color:#6B7280;">Datum vystavení / DUZP: <strong>${issueDate}</strong></div>
        <div style="font-size:13px;color:#6B7280;margin-top:4px;">Způsob úhrady: <strong>${paymentLabel}</strong></div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px;color:#059669;font-weight:800;">Stav: ${statusLabel}</div>
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
          <td style="text-align:right;">${safeAmount} ${safeCurrency}</td>
        </tr>
      </tbody>
    </table>
    <div class="total">Celkem k úhradě: ${safeAmount} ${safeCurrency}</div>
    <div class="actions">
      <button class="btn" onclick="window.print()">Vytisknout / Uložit jako PDF</button>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
