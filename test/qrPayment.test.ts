import { test } from 'node:test';
import assert from 'node:assert/strict';
import { czechAccountToIban, generateSpaydString } from '../src/utils/qrPayment';

test('converts Czech account number and bank code to valid IBAN', () => {
  // Fio banka: 2010, účet 2100000000 -> CZ0420100000002100000000
  const iban = czechAccountToIban('2100000000', '2010');
  assert.strictEqual(iban.startsWith('CZ'), true);
  assert.strictEqual(iban.length, 24);
  assert.strictEqual(iban.includes('20100000002100000000'), true);
});

test('generates valid SPAYD string for QR platba', () => {
  const spayd = generateSpaydString({
    accountNumber: '2100000000',
    bankCode: '2010',
    amount: 99,
    currency: 'CZK',
    variableSymbol: '202611001',
    message: 'ProEdu Premium: test@example.com'
  });

  assert.strictEqual(spayd.startsWith('SPD*1.0*ACC:CZ'), true);
  assert.strictEqual(spayd.includes('*AM:99.00*CC:CZK*'), true);
  assert.strictEqual(spayd.includes('*X-VS:202611001*'), true);
  assert.strictEqual(spayd.includes('MSG:ProEdu Premium: test@example.com*'), true);
});
