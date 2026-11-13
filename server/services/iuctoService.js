/**
 * iÚčto REST API v1.3 integrační služba pro ProEdu (server-only).
 * Dokumentace: https://developers.iucto.cz/ | OpenAPI 3.1: https://developers.iucto.cz/spec/openapi.yaml
 */

const DEFAULT_IUCTO_BASE_URL = 'https://online.iucto.cz/api/1.3';
const DICTIONARY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hodin

/**
 * Převod názvu země na dvoupísmenný ISO-2 kód vyžadovaný iÚčtem.
 */
export function mapCountryToIso2(countryRaw) {
  const val = String(countryRaw || '').trim();
  if (!val) return 'CZ';

  const normalized = val.toLowerCase();
  if (
    normalized === 'cz' ||
    normalized === 'česká republika' ||
    normalized === 'ceska republika' ||
    normalized === 'česko' ||
    normalized === 'cesko' ||
    normalized === 'czech republic' ||
    normalized === 'czechia'
  ) {
    return 'CZ';
  }
  if (
    normalized === 'sk' ||
    normalized === 'slovensko' ||
    normalized === 'slovenská republika' ||
    normalized === 'slovenska republika' ||
    normalized === 'slovakia'
  ) {
    return 'SK';
  }
  if (/^[a-z]{2}$/i.test(val)) {
    return val.toUpperCase();
  }
  return 'CZ';
}

/**
 * Formátuje datum do YYYY-MM-DD v časové zóně Europe/Prague.
 */
export function formatPragueDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(validDate);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Čistý variabilní symbol (pouze číslice, max 10 znaků dle iÚčto API).
 */
export function sanitizeVariableSymbol(vs) {
  const digits = String(vs || '').replace(/\D/g, '');
  return digits.slice(0, 10) || undefined;
}

/**
 * Zjistí, zda se jedná o testovací/sandboxovou objednávku.
 */
export function isOrderSandbox(order, env = process.env) {
  if (!order) return env.COMGATE_TEST_MODE !== 'false';
  if (order.isSandbox === true) return true;
  if (String(order.comgateTransId || '').startsWith('SANDBOX')) return true;
  if (env.COMGATE_TEST_MODE !== 'false') return true;
  return false;
}

/**
 * Rozhodne, zda se má pro danou objednávku volat iÚčto API.
 * Přísně odděluje sandboxové platby od ostrého účetnictví.
 */
export function shouldRunIuctoForOrder(order, env = process.env) {
  const apiKey = String(env.IUCTO_API_KEY || '').trim();
  if (!apiKey) {
    return { allowed: false, reason: 'missing_api_key' };
  }

  const sandbox = isOrderSandbox(order, env);
  const sandboxEnabled = String(env.IUCTO_SANDBOX_ENABLED || 'false').toLowerCase() === 'true';

  if (sandbox && !sandboxEnabled) {
    return { allowed: false, reason: 'sandbox_skipped' };
  }

  return { allowed: true, reason: sandbox ? 'sandbox_enabled' : 'live' };
}

/**
 * Sestaví tělo požadavku pro POST/PUT /customer.
 */
export function buildCustomerPayload({ userId, userDoc = {}, order = {} }) {
  const billing = userDoc?.billingDetails || {};
  const addr = order?.billingAddress || {};

  const name = String(order?.clientName || billing.clientName || userDoc?.name || 'Zákazník ProEdu')
    .trim()
    .slice(0, 100);
  const email = String(order?.invoiceEmail || billing.invoiceEmail || userDoc?.email || '')
    .trim()
    .slice(0, 100);
  const ico = String(order?.ico ?? billing.ico ?? '').trim().slice(0, 20);
  const dic = String(order?.dic ?? billing.dic ?? '').trim().slice(0, 20);
  const street = String(addr.street ?? billing.street ?? '').trim().slice(0, 100);
  const city = String(addr.city ?? billing.city ?? '').trim().slice(0, 100);
  const postalcode = String(addr.zip ?? billing.zip ?? '').trim().slice(0, 20);
  const country = mapCountryToIso2(addr.country ?? billing.country);

  const payload = {
    name: name || 'Zákazník ProEdu',
    external_code: `PROEDU_${String(userId || 'unknown')}`.slice(0, 50),
    vat_payer: Boolean(dic),
    usual_maturity: 14,
    preferred_payment_method: order?.paymentMethod === 'qr_bank_transfer' ? 'transfer' : 'creditcard',
    invoice_language: 'cs',
    address: {
      street: street || '-',
      city: city || '-',
      postalcode: postalcode || '00000',
      country
    }
  };

  if (email) payload.email = email;
  if (ico) payload.comid = ico;
  if (dic) payload.vatid = dic;

  return payload;
}

/**
 * Sestaví tělo požadavku pro POST /invoice_issued.
 */
export function buildInvoiceIssuedPayload({
  customerId,
  orderId,
  order = {},
  bankAccountId,
  isVatPayer = false,
  accountingEntry = null
}) {
  const issueDate = formatPragueDate(order.paidAt || order.createdAt || new Date());
  const amountPrice = Number(order.amount || 99);
  const vs = sanitizeVariableSymbol(order.variableSymbol);
  const paymentType = order.paymentMethod === 'qr_bank_transfer' ? 'transfer' : 'creditcard';

  const item = {
    text: order.isRecurringRenewal
      ? 'ProEducator Premium – měsíční předplatné (obnovení)'
      : 'ProEducator Premium – měsíční předplatné',
    amount: 1,
    price: amountPrice,
    unit: 'měs.',
    vat: isVatPayer ? 21 : 0,
    ...(isVatPayer ? { unit_price_inc_vat: true } : {}),
    ...(accountingEntry || {})
  };

  const payload = {
    customer_id: Number(customerId),
    date: issueDate,
    maturity_date: issueDate,
    currency: order.currency || 'CZK',
    payment_type: paymentType,
    bank_account: Number(bankAccountId),
    description: `Objednávka ProEdu #${orderId}${order.comgateTransId ? ` (Comgate ${order.comgateTransId})` : ''}`,
    items: [item]
  };

  if (vs) {
    payload.variable_symbol = vs;
  }
  // U neplátce DPH se date_vat nesmí posílat
  if (isVatPayer) {
    payload.date_vat = issueDate;
  }

  return payload;
}

/**
 * Sestaví tělo požadavku pro POST /payment_received.
 * Poznámka dle OpenAPI 3.1: payment_received povoluje POUZE 'transfer' a 'cash' (ne 'creditcard').
 */
export function buildPaymentReceivedPayload({
  customerId,
  invoiceId,
  invoiceNumber,
  order = {},
  bankAccountId,
  isVatPayer = false,
  accountingEntry = null
}) {
  const paidDate = formatPragueDate(order.paidAt || new Date());
  const amountPrice = Number(order.amount || 99);
  const vs = sanitizeVariableSymbol(order.variableSymbol);

  const item = {
    text: `Úhrada faktury ${invoiceNumber || invoiceId}`,
    amount: 1,
    price: amountPrice,
    vat: isVatPayer ? 21 : 0,
    ...(isVatPayer ? { unit_price_inc_vat: true } : {}),
    ...(accountingEntry || {})
  };

  const payload = {
    customer_id: Number(customerId),
    invoice_id: Number(invoiceId),
    date: paidDate,
    payment_type: 'transfer',
    bank_account: Number(bankAccountId),
    full_paid: true,
    description: `Online platba Comgate${order.comgateTransId ? ` (${order.comgateTransId})` : ''}`,
    items: [item]
  };

  if (vs) {
    payload.variable_symbol = vs;
  }
  if (isVatPayer) {
    payload.date_vat = paidDate;
  }

  return payload;
}

/**
 * Sestaví tělo požadavku pro POST /creditnote_issued.
 * Poznámka dle OpenAPI 3.1: description je povinné a množství u položky se posílá záporné (-1).
 */
export function buildCreditNotePayload({
  customerId,
  originalInvoiceId,
  orderId,
  order = {},
  bankAccountId,
  reason,
  isVatPayer = false,
  accountingEntry = null
}) {
  const issueDate = formatPragueDate(new Date());
  const amountPrice = Number(order.amount || 99);
  const vs = sanitizeVariableSymbol(order.variableSymbol);

  const item = {
    text: `Storno: ProEducator Premium – měsíční předplatné (#${orderId})`,
    amount: -1,
    price: amountPrice,
    unit: 'měs.',
    vat: isVatPayer ? 21 : 0,
    ...(isVatPayer ? { unit_price_inc_vat: true } : {}),
    ...(accountingEntry || {})
  };

  const payload = {
    invoice_issued_id: Number(originalInvoiceId),
    customer_id: Number(customerId),
    date: issueDate,
    maturity_date: issueDate,
    currency: order.currency || 'CZK',
    payment_type: 'transfer',
    bank_account: Number(bankAccountId),
    description: String(reason || `Storno a vrácení platby objednávky #${orderId}`).trim().slice(0, 500),
    items: [item]
  };

  if (vs) {
    payload.variable_symbol = vs;
  }
  if (isVatPayer) {
    payload.date_vat = issueDate;
  }

  return payload;
}

/**
 * Vytvoří instanci iÚčto API klienta (umožňuje čisté testování s mock fetch/env).
 */
export function createIuctoClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let dictionaryCache = null;
  let dictionaryCacheExpiresAt = 0;

  function getConfig() {
    return {
      apiKey: String(env.IUCTO_API_KEY || '').trim(),
      baseUrl: String(env.IUCTO_API_BASE_URL || DEFAULT_IUCTO_BASE_URL).replace(/\/+$/, ''),
      explicitBankAccountId: env.IUCTO_COMGATE_BANK_ACCOUNT_ID
        ? Number(env.IUCTO_COMGATE_BANK_ACCOUNT_ID)
        : null,
      autoAccount: String(env.IUCTO_AUTO_ACCOUNT || 'false').toLowerCase() === 'true'
    };
  }

  async function iuctoRequest(apiPath, { method = 'GET', body, accept = 'application/hal+json', responseType = 'json' } = {}) {
    const { apiKey, baseUrl } = getConfig();
    if (!apiKey) {
      const err = new Error('Chybí IUCTO_API_KEY v konfiguraci serveru.');
      err.statusCode = 500;
      throw err;
    }

    const url = `${baseUrl}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
    const headers = {
      'X-Auth-Key': apiKey,
      Accept: accept
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      const rawText = await res.text().catch(() => '');
      let parsed = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = null;
      }

      const detail = parsed?.detail || parsed?.message || parsed?.title || rawText || res.statusText;
      let prefix = `iÚčto API chyba (${res.status})`;
      if (res.status === 401) {
        prefix = 'Neplatný IUCTO_API_KEY nebo chybějící oprávnění v iÚčtu (401)';
      } else if (res.status === 402) {
        prefix = 'Vyčerpána API kvóta iÚčta nebo limit dokladů v aktuálním tarifu (402)';
      }

      const err = new Error(`${prefix}: ${detail}`);
      err.statusCode = res.status;
      err.details = parsed || rawText;
      throw err;
    }

    if (res.status === 204) {
      return null;
    }
    if (responseType === 'buffer') {
      const arrBuf = await res.arrayBuffer();
      return Buffer.from(arrBuf);
    }
    return res.json();
  }

  function pickEntryPair(entryMap, vatMap, entryKeywords, vatKeywords) {
    if (!entryMap || !vatMap || typeof entryMap !== 'object' || typeof vatMap !== 'object') {
      return null;
    }
    const entryEntries = Object.entries(entryMap);
    const vatEntries = Object.entries(vatMap);
    if (entryEntries.length === 0 || vatEntries.length === 0) {
      return null;
    }

    const matchedEntry =
      entryEntries.find(([, label]) => entryKeywords.test(String(label || ''))) || entryEntries[0];
    const matchedVat =
      vatEntries.find(([, label]) => vatKeywords.test(String(label || ''))) || vatEntries[0];

    if (!matchedEntry || !matchedVat) return null;
    return {
      accountentrytype_id: Number(matchedEntry[0]),
      vattype_id: Number(matchedVat[0])
    };
  }

  async function getDictionaries(forceRefresh = false) {
    if (!forceRefresh && dictionaryCache && Date.now() < dictionaryCacheExpiresAt) {
      return dictionaryCache;
    }

    const { explicitBankAccountId } = getConfig();
    const [companyProfile, bankAccountsResp] = await Promise.all([
      iuctoRequest('/company_profile').catch(() => null),
      iuctoRequest('/bank_account?page=1&pageSize=50')
    ]);

    const bankAccounts = bankAccountsResp?._embedded?.bank_account || [];
    let comgateBankAccount = null;

    if (explicitBankAccountId) {
      comgateBankAccount = bankAccounts.find(b => Number(b.id) === explicitBankAccountId) || {
        id: explicitBankAccountId
      };
    } else {
      comgateBankAccount =
        bankAccounts.find(b => /comgate|brana|brána|karta|card/i.test(String(b.name || ''))) ||
        bankAccounts.find(b => String(b.currency || '').toUpperCase() === 'CZK') ||
        bankAccounts[0] ||
        null;
    }

    if (!comgateBankAccount?.id) {
      throw new Error(
        'V iÚčtu nebyl nalezen žádný bankovní účet. Založte v iÚčtu účet (např. pro Comgate) nebo nastavte IUCTO_COMGATE_BANK_ACCOUNT_ID.'
      );
    }

    const isVatPayer = Boolean(companyProfile?.vat_payer);
    const vatRegex = isVatPayer ? /zdaniteln|čr|tuzem/i : /bez dph|neplátce|osvobozen/i;

    const [aeFv, vatFv, aePp, vatPp, aeOdv, vatOdv] = await Promise.all([
      iuctoRequest('/accountentry_type?doctype=FV').catch(() => null),
      iuctoRequest('/vat_type?doctype=FV').catch(() => null),
      iuctoRequest('/accountentry_type?doctype=PP').catch(() => null),
      iuctoRequest('/vat_type?doctype=PP').catch(() => null),
      iuctoRequest('/accountentry_type?doctype=ODV').catch(() => null),
      iuctoRequest('/vat_type?doctype=ODV').catch(() => null)
    ]);

    dictionaryCache = {
      companyProfile,
      isVatPayer,
      bankAccountId: Number(comgateBankAccount.id),
      bankAccounts,
      accounting: {
        FV: pickEntryPair(aeFv, vatFv, /služb|sluzb|prodej|tržb|trzb|předplat/i, vatRegex),
        PP: pickEntryPair(aePp, vatPp, /úhrad|uhrad|faktur/i, vatRegex),
        ODV: pickEntryPair(aeOdv, vatOdv, /služb|sluzb|prodej|dobropis/i, vatRegex)
      }
    };
    dictionaryCacheExpiresAt = Date.now() + DICTIONARY_CACHE_TTL_MS;
    return dictionaryCache;
  }

  function hasCustomerChanged(existing, desired) {
    if (!existing) return true;
    const extAddr = existing.address || {};
    const desAddr = desired.address || {};
    return (
      String(existing.name || '') !== String(desired.name || '') ||
      String(existing.email || '') !== String(desired.email || '') ||
      String(existing.comid || '') !== String(desired.comid || '') ||
      String(existing.vatid || '') !== String(desired.vatid || '') ||
      Boolean(existing.vat_payer) !== Boolean(desired.vat_payer) ||
      String(extAddr.street || '') !== String(desAddr.street || '') ||
      String(extAddr.city || '') !== String(desAddr.city || '') ||
      String(extAddr.postalcode || '') !== String(desAddr.postalcode || '') ||
      String(extAddr.country || '') !== String(desAddr.country || '')
    );
  }

  /**
   * Najde, založí nebo aktualizuje zákazníka v iÚčtu.
   */
  async function syncCustomer({ userId, userDoc = {}, order = {} }) {
    const desired = buildCustomerPayload({ userId, userDoc, order });
    let existing = null;

    if (userDoc?.iuctoCustomerId) {
      try {
        existing = await iuctoRequest(`/customer/${Number(userDoc.iuctoCustomerId)}`);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    }

    if (!existing && desired.external_code) {
      const list = await iuctoRequest(
        `/customer?external_code=${encodeURIComponent(desired.external_code)}&pageSize=1`
      );
      existing = list?._embedded?.customer?.[0] || null;
    }

    if (!existing && desired.comid) {
      const list = await iuctoRequest(`/customer?comid=${encodeURIComponent(desired.comid)}&pageSize=1`);
      existing = list?._embedded?.customer?.[0] || null;
    }

    if (!existing && desired.email) {
      const list = await iuctoRequest(`/customer?email=${encodeURIComponent(desired.email)}&pageSize=1`);
      existing = list?._embedded?.customer?.[0] || null;
    }

    if (existing?.id) {
      if (hasCustomerChanged(existing, desired)) {
        const updated = await iuctoRequest(`/customer/${existing.id}`, {
          method: 'PUT',
          body: desired
        });
        return Number(updated?.id || existing.id);
      }
      return Number(existing.id);
    }

    const created = await iuctoRequest('/customer', {
      method: 'POST',
      body: desired
    });
    return Number(created.id);
  }

  /**
   * Vystaví uhrazenou vydanou fakturu v iÚčtu, spáruje přijatou platbu a stáhne PDF.
   */
  async function issuePaidInvoice({ orderId, order = {}, userDoc = {} }) {
    const gate = shouldRunIuctoForOrder(order, env);
    if (!gate.allowed) {
      return { skipped: true, reason: gate.reason };
    }

    const { autoAccount } = getConfig();
    const dict = await getDictionaries();
    const customerId = await syncCustomer({
      userId: order.userId || userDoc.uid,
      userDoc,
      order
    });

    let invoiceId = order.iuctoInvoiceId ? Number(order.iuctoInvoiceId) : null;
    let invoiceNumber = order.iuctoInvoiceNumber || null;

    if (!invoiceId) {
      const invoicePayload = buildInvoiceIssuedPayload({
        customerId,
        orderId,
        order,
        bankAccountId: dict.bankAccountId,
        isVatPayer: dict.isVatPayer,
        accountingEntry: dict.accounting.FV
      });

      const createdInvoice = await iuctoRequest('/invoice_issued', {
        method: 'POST',
        body: invoicePayload
      });

      invoiceId = Number(createdInvoice.id);
      invoiceNumber = createdInvoice.sequence_code || String(invoiceId);

      if (autoAccount && dict.accounting.FV) {
        await iuctoRequest(`/invoice_issued/${invoiceId}/account`, { method: 'PUT' }).catch(err => {
          console.warn(`[iÚčto] Nepodařilo se automaticky zaúčtovat fakturu ${invoiceId}:`, err.message);
        });
      }
    }

    let paymentId = order.iuctoPaymentId ? Number(order.iuctoPaymentId) : null;
    if (!paymentId) {
      const paymentPayload = buildPaymentReceivedPayload({
        customerId,
        invoiceId,
        invoiceNumber,
        order,
        bankAccountId: dict.bankAccountId,
        isVatPayer: dict.isVatPayer,
        accountingEntry: dict.accounting.PP
      });

      const createdPayment = await iuctoRequest('/payment_received', {
        method: 'POST',
        body: paymentPayload
      });
      paymentId = Number(createdPayment.id);

      if (autoAccount && dict.accounting.PP) {
        await iuctoRequest(`/payment_received/${paymentId}/account`, { method: 'PUT' }).catch(err => {
          console.warn(`[iÚčto] Nepodařilo se automaticky zaúčtovat platbu ${paymentId}:`, err.message);
        });
      }
    }

    const pdfBuffer = await iuctoRequest(`/invoice_issued/${invoiceId}/pdf`, {
      accept: 'application/pdf',
      responseType: 'buffer'
    });

    const safeNumber = String(invoiceNumber || invoiceId).replace(/[^a-zA-Z0-9_-]/g, '_');

    return {
      skipped: false,
      iuctoCustomerId: customerId,
      iuctoInvoiceId: String(invoiceId),
      iuctoInvoiceNumber: String(invoiceNumber || invoiceId),
      iuctoPaymentId: String(paymentId),
      pdfBuffer,
      pdfFilename: `faktura-${safeNumber}.pdf`
    };
  }

  /**
   * Stáhne binární PDF vydané faktury z iÚčta.
   */
  async function downloadInvoicePdf(iuctoInvoiceId) {
    if (!iuctoInvoiceId) {
      throw new Error('Objednávka nemá přiřazené iÚčto ID faktury.');
    }
    return iuctoRequest(`/invoice_issued/${Number(iuctoInvoiceId)}/pdf`, {
      accept: 'application/pdf',
      responseType: 'buffer'
    });
  }

  /**
   * Vystaví dobropis (opravný daňový doklad) k již vystavené faktuře.
   */
  async function issueCreditNote({ orderId, order = {}, userDoc = {}, reason, sendEmailViaIucto = true }) {
    const gate = shouldRunIuctoForOrder(order, env);
    if (!gate.allowed) {
      return { skipped: true, reason: gate.reason };
    }
    if (!order.iuctoInvoiceId) {
      throw new Error('K této objednávce nebyla v iÚčtu vystavena faktura, nelze vytvořit dobropis.');
    }
    if (order.iuctoCreditNoteId) {
      return {
        skipped: false,
        alreadyExists: true,
        iuctoCreditNoteId: String(order.iuctoCreditNoteId),
        iuctoCreditNoteNumber: order.iuctoCreditNoteNumber || null,
        iuctoCreditNoteShareUrl: order.iuctoCreditNoteShareUrl || null
      };
    }

    const { autoAccount } = getConfig();
    const dict = await getDictionaries();
    const customerId = await syncCustomer({
      userId: order.userId || userDoc.uid,
      userDoc,
      order
    });

    const payload = buildCreditNotePayload({
      customerId,
      originalInvoiceId: order.iuctoInvoiceId,
      orderId,
      order,
      bankAccountId: dict.bankAccountId,
      reason,
      isVatPayer: dict.isVatPayer,
      accountingEntry: dict.accounting.ODV
    });

    const created = await iuctoRequest('/creditnote_issued', {
      method: 'POST',
      body: payload
    });
    const creditNoteId = Number(created.id);
    const creditNoteNumber = created.sequence_code || String(creditNoteId);

    if (autoAccount && dict.accounting.ODV) {
      await iuctoRequest(`/creditnote_issued/${creditNoteId}/account`, { method: 'PUT' }).catch(err => {
        console.warn(`[iÚčto] Nepodařilo se zaúčtovat dobropis ${creditNoteId}:`, err.message);
      });
    }

    let shareUrl = created.share_link || null;
    try {
      const shareRes = await iuctoRequest(`/creditnote_issued/${creditNoteId}/share`, {
        method: 'PUT',
        body: {}
      });
      shareUrl = shareRes?.share_link || shareUrl;
    } catch (shareErr) {
      console.warn('[iÚčto] Nepodařilo se vygenerovat share_link pro dobropis:', shareErr.message);
    }

    if (sendEmailViaIucto && order.invoiceEmail) {
      await iuctoRequest(`/creditnote_issued/${creditNoteId}/email`, {
        method: 'POST',
        body: {
          message: `Dobrý den, v příloze zasíláme opravný daňový doklad (dobropis) k objednávce #${orderId}.`,
          recipient: [order.invoiceEmail],
          hidden_copy: [],
          attach_pdf: true
        }
      }).catch(emailErr => {
        console.warn('[iÚčto] Odeslání dobropisu e-mailem přes iÚčto selhalo:', emailErr.message);
      });
    }

    return {
      skipped: false,
      iuctoCustomerId: customerId,
      iuctoCreditNoteId: String(creditNoteId),
      iuctoCreditNoteNumber: String(creditNoteNumber),
      iuctoCreditNoteShareUrl: shareUrl
    };
  }

  /**
   * Ověří spojení s iÚčtem a vrátí profil firmy + nalezené bankovní účty.
   */
  async function checkConnection() {
    const { apiKey } = getConfig();
    if (!apiKey) {
      return { configured: false, connected: false, error: 'IUCTO_API_KEY není nastaven.' };
    }
    const dict = await getDictionaries(true);
    return {
      configured: true,
      connected: true,
      companyName: dict.companyProfile?.name || null,
      isVatPayer: dict.isVatPayer,
      selectedBankAccountId: dict.bankAccountId,
      bankAccounts: dict.bankAccounts.map(b => ({ id: b.id, name: b.name, currency: b.currency }))
    };
  }

  return {
    getDictionaries,
    syncCustomer,
    issuePaidInvoice,
    downloadInvoicePdf,
    issueCreditNote,
    checkConnection
  };
}

export const iuctoService = createIuctoClient();
