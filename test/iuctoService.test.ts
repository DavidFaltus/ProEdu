import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapCountryToIso2,
  sanitizeVariableSymbol,
  shouldRunIuctoForOrder,
  buildCustomerPayload,
  buildInvoiceIssuedPayload,
  buildPaymentReceivedPayload,
  buildCreditNotePayload,
  createIuctoClient
} from '../server/services/iuctoService.js';

test('mapCountryToIso2 converts Czech/Slovak names to ISO-2 codes', () => {
  assert.equal(mapCountryToIso2('Česká republika'), 'CZ');
  assert.equal(mapCountryToIso2('Slovensko'), 'SK');
  assert.equal(mapCountryToIso2('de'), 'DE');
  assert.equal(mapCountryToIso2(''), 'CZ');
});

test('sanitizeVariableSymbol strips non-digits and limits to 10 chars', () => {
  assert.equal(sanitizeVariableSymbol('VS-123456789012'), '1234567890');
  assert.equal(sanitizeVariableSymbol(''), undefined);
});

test('shouldRunIuctoForOrder strictly isolates sandbox from production iÚčto', () => {
  assert.deepEqual(
    shouldRunIuctoForOrder({ isSandbox: false }, { IUCTO_API_KEY: '', COMGATE_TEST_MODE: 'false' }),
    { allowed: false, reason: 'missing_api_key' }
  );
  assert.deepEqual(
    shouldRunIuctoForOrder({ isSandbox: true }, { IUCTO_API_KEY: 'abc', COMGATE_TEST_MODE: 'true' }),
    { allowed: false, reason: 'sandbox_skipped' }
  );
  assert.deepEqual(
    shouldRunIuctoForOrder(
      { isSandbox: false, comgateTransId: 'SANDBOX_123' },
      { IUCTO_API_KEY: 'abc', COMGATE_TEST_MODE: 'false', IUCTO_SANDBOX_ENABLED: 'false' }
    ),
    { allowed: false, reason: 'sandbox_skipped' }
  );
  assert.deepEqual(
    shouldRunIuctoForOrder(
      { isSandbox: true },
      { IUCTO_API_KEY: 'abc', COMGATE_TEST_MODE: 'true', IUCTO_SANDBOX_ENABLED: 'true' }
    ),
    { allowed: true, reason: 'sandbox_enabled' }
  );
  assert.deepEqual(
    shouldRunIuctoForOrder(
      { isSandbox: false, comgateTransId: 'LIVE-999' },
      { IUCTO_API_KEY: 'abc', COMGATE_TEST_MODE: 'false' }
    ),
    { allowed: true, reason: 'live' }
  );
});

test('buildCustomerPayload sets external_code, ISO-2 country, and vat_payer only when DIČ present', () => {
  const person = buildCustomerPayload({
    userId: 'uid_abc',
    order: {
      clientName: 'Jan Novák',
      invoiceEmail: 'jan@example.cz',
      billingAddress: { street: 'Školní 1', city: 'Praha', zip: '11000', country: 'Česká republika' },
      paymentMethod: 'comgate'
    }
  });
  assert.equal(person.external_code, 'PROEDU_uid_abc');
  assert.equal(person.vat_payer, false);
  assert.equal(person.vatid, undefined);
  assert.equal(person.address.country, 'CZ');

  const company = buildCustomerPayload({
    userId: 'uid_firm',
    order: {
      clientName: 'Firma s.r.o.',
      invoiceEmail: 'fakturace@firma.cz',
      ico: '12345678',
      dic: 'CZ12345678',
      billingAddress: { street: 'Hlavní 5', city: 'Brno', zip: '60200', country: 'Česká republika' }
    }
  });
  assert.equal(company.comid, '12345678');
  assert.equal(company.vatid, 'CZ12345678');
  assert.equal(company.vat_payer, true);
});

test('buildInvoiceIssuedPayload omits date_vat and sets vat=0 for non-VAT payer', () => {
  const payload = buildInvoiceIssuedPayload({
    customerId: 77,
    orderId: 'ord_1',
    order: {
      amount: 99,
      currency: 'CZK',
      variableSymbol: '123456789',
      paymentMethod: 'comgate',
      comgateTransId: 'CG-1',
      paidAt: '2026-11-13T10:00:00.000Z'
    },
    bankAccountId: 456,
    isVatPayer: false
  });

  assert.equal(payload.customer_id, 77);
  assert.equal(payload.payment_type, 'creditcard');
  assert.equal(payload.bank_account, 456);
  assert.equal('date_vat' in payload, false);
  assert.equal(payload.items[0].vat, 0);
  assert.equal(payload.items[0].price, 99);
});

test('buildPaymentReceivedPayload always uses transfer and attaches invoice_id', () => {
  const payload = buildPaymentReceivedPayload({
    customerId: 77,
    invoiceId: 888,
    invoiceNumber: 'FV20260001',
    order: { amount: 99, variableSymbol: '123456789', paidAt: '2026-11-13T10:00:00.000Z' },
    bankAccountId: 456,
    isVatPayer: false
  });

  assert.equal(payload.payment_type, 'transfer');
  assert.equal(payload.invoice_id, 888);
  assert.equal(payload.bank_account, 456);
  assert.equal(payload.full_paid, true);
  assert.equal(payload.items.length, 1);
});

test('buildCreditNotePayload sends required description and negative amount', () => {
  const payload = buildCreditNotePayload({
    customerId: 77,
    originalInvoiceId: 888,
    orderId: 'ord_1',
    order: { amount: 99, currency: 'CZK', variableSymbol: '123456789' },
    bankAccountId: 456,
    reason: 'Vrácení platby studentovi',
    isVatPayer: false
  });

  assert.equal(payload.invoice_issued_id, 888);
  assert.equal(payload.description, 'Vrácení platby studentovi');
  assert.equal(payload.items[0].amount, -1);
  assert.equal(payload.items[0].price, 99);
});

test('createIuctoClient issues customer, invoice, payment, PDF and supports credit note', async () => {
  const calls: Array<{ url: string; method: string; body: any }> = [];
  const mockFetch = async (url: string, opts: any = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    assert.equal(opts.headers['X-Auth-Key'], 'test-key');

    if (url.endsWith('/company_profile')) {
      return new Response(JSON.stringify({ name: 'ProEdu Test', vat_payer: false }), { status: 200 });
    }
    if (url.includes('/bank_account')) {
      return new Response(
        JSON.stringify({ _embedded: { bank_account: [{ id: 10, name: 'Comgate brána', currency: 'CZK' }] } }),
        { status: 200 }
      );
    }
    if (url.includes('/accountentry_type') || url.includes('/vat_type')) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (url.endsWith('/customer/501') && (opts.method || 'GET') === 'GET') {
      return new Response(
        JSON.stringify({
          id: 501,
          name: 'Petr Test',
          email: 'petr@test.cz',
          comid: '',
          vatid: '',
          vat_payer: false,
          address: { street: 'Dlouhá 1', city: 'Praha', postalcode: '11000', country: 'CZ' }
        }),
        { status: 200 }
      );
    }
    if (url.includes('/customer?') && (opts.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({ _embedded: { customer: [] } }), { status: 200 });
    }
    if (url.endsWith('/customer') && opts.method === 'POST') {
      return new Response(JSON.stringify({ id: 501 }), { status: 201 });
    }
    if (url.endsWith('/invoice_issued') && opts.method === 'POST') {
      return new Response(JSON.stringify({ id: 9001, sequence_code: 'FV20260001' }), { status: 201 });
    }
    if (url.endsWith('/payment_received') && opts.method === 'POST') {
      return new Response(JSON.stringify({ id: 7001 }), { status: 201 });
    }
    if (url.endsWith('/invoice_issued/9001/pdf')) {
      return new Response(Buffer.from('%PDF-1.4 mock'), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' }
      });
    }
    if (url.endsWith('/creditnote_issued') && opts.method === 'POST') {
      return new Response(JSON.stringify({ id: 3001, sequence_code: 'ODD20260001' }), { status: 201 });
    }
    if (url.endsWith('/creditnote_issued/3001/share') && opts.method === 'PUT') {
      return new Response(JSON.stringify({ share_link: 'https://online.iucto.cz/link/c?s=abc' }), { status: 200 });
    }
    if (url.endsWith('/creditnote_issued/3001/email') && opts.method === 'POST') {
      return new Response(JSON.stringify({ send: true }), { status: 200 });
    }
    throw new Error('Unexpected URL: ' + url);
  };

  const client = createIuctoClient({
    env: {
      IUCTO_API_KEY: 'test-key',
      COMGATE_TEST_MODE: 'false'
    },
    fetchImpl: mockFetch
  });

  const order = {
    userId: 'u1',
    clientName: 'Petr Test',
    invoiceEmail: 'petr@test.cz',
    billingAddress: { street: 'Dlouhá 1', city: 'Praha', zip: '11000', country: 'Česká republika' },
    amount: 99,
    currency: 'CZK',
    variableSymbol: '998877665',
    paymentMethod: 'comgate',
    comgateTransId: 'LIVE-123',
    isSandbox: false,
    paidAt: '2026-11-13T12:00:00.000Z'
  };

  const res = await client.issuePaidInvoice({ orderId: 'ord_test_1', order });
  assert.equal(res.skipped, false);
  assert.equal(res.iuctoCustomerId, 501);
  assert.equal(res.iuctoInvoiceId, '9001');
  assert.equal(res.iuctoInvoiceNumber, 'FV20260001');
  assert.equal(res.iuctoPaymentId, '7001');
  assert.equal(res.pdfBuffer.toString(), '%PDF-1.4 mock');

  const paymentCall = calls.find(c => c.url.endsWith('/payment_received') && c.method === 'POST');
  assert.equal(paymentCall.body.payment_type, 'transfer');
  assert.equal(paymentCall.body.bank_account, 10);
  assert.equal(paymentCall.body.invoice_id, 9001);

  const cnRes = await client.issueCreditNote({
    orderId: 'ord_test_1',
    order: { ...order, iuctoInvoiceId: '9001' },
    userDoc: { iuctoCustomerId: 501 },
    reason: 'Reklamace'
  });
  assert.equal(cnRes.iuctoCreditNoteId, '3001');
  assert.equal(cnRes.iuctoCreditNoteNumber, 'ODD20260001');
  assert.equal(cnRes.iuctoCreditNoteShareUrl, 'https://online.iucto.cz/link/c?s=abc');
});

test('createIuctoClient surfaces HTTP 402 quota error clearly', async () => {
  const client = createIuctoClient({
    env: { IUCTO_API_KEY: 'test-key' },
    fetchImpl: (async () =>
      new Response(JSON.stringify({ detail: 'Daily limit reached' }), { status: 402 })) as any
  });

  await assert.rejects(
    () => client.checkConnection(),
    /Vyčerpána API kvóta iÚčta/
  );
});
