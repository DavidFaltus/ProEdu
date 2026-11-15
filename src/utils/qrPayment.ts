/**
 * Utilita pro generování českých platebních QR kódů podle standardu SPAYD (Short Payment Descriptor).
 * Standard ČBA (Česká bankovní asociace) podporovaný všemi českými bankami.
 */

/**
 * Převod českého čísla účtu a kódu banky na mezinárodní formát IBAN.
 * Validuje číselný vstup, aby nikdy nevznikl neplatný IBAN s NaN.
 */
export function czechAccountToIban(accountNumberRaw: string, bankCodeRaw: string): string {
  const rawBank = String(bankCodeRaw ?? '').trim();
  if (!/^\d{1,4}$/.test(rawBank)) {
    throw new Error('Neplatný kód banky pro výpočet IBAN.');
  }
  const bankCode = rawBank.padStart(4, '0');

  const rawAccount = String(accountNumberRaw ?? '').trim();
  const parts = rawAccount.split('-');
  if (parts.length > 2) {
    throw new Error('Neplatný formát čísla účtu pro výpočet IBAN.');
  }

  let prefix = '000000';
  let account = parts[0];

  if (parts.length === 2) {
    const rawPrefix = parts[0].trim();
    if (rawPrefix && !/^\d{1,6}$/.test(rawPrefix)) {
      throw new Error('Neplatné předčíslí bankovního účtu.');
    }
    prefix = (rawPrefix || '0').padStart(6, '0');
    account = parts[1].trim();
  }

  if (!/^\d{1,10}$/.test(account) || /^0+$/.test(account)) {
    throw new Error('Neplatné číslo bankovního účtu pro výpočet IBAN.');
  }

  const paddedAccount = account.padStart(10, '0');
  const bban = `${bankCode}${prefix}${paddedAccount}`;

  // CZ = 12 35, 00 pro výpočet kontrolních číslic
  const numericString = `${bban}123500`;

  // Výpočet modulo 97 pro dlouhé číslo
  let remainder = 0;
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder * 10 + Number(numericString[i])) % 97;
  }

  const checkDigits = (98 - remainder).toString().padStart(2, '0');
  return `CZ${checkDigits}${bban}`;
}

export interface QrPaymentOptions {
  accountNumber: string;
  bankCode: string;
  amount: number;
  currency?: string;
  variableSymbol?: string;
  message?: string;
  recipientName?: string;
}

/**
 * Vygeneruje SPAYD řetězec:
 * SPD*1.0*ACC:CZ...*AM:99.00*CC:CZK*VS:...*MSG:...*
 */
export function generateSpaydString(options: QrPaymentOptions): string {
  const {
    accountNumber,
    bankCode,
    amount,
    currency = 'CZK',
    variableSymbol,
    message,
    recipientName
  } = options;

  const iban = czechAccountToIban(accountNumber, bankCode);
  const parts: string[] = ['SPD', '1.0', `ACC:${iban}`, `AM:${amount.toFixed(2)}`, `CC:${currency}`];

  if (variableSymbol) {
    const cleanVs = variableSymbol.replace(/\D/g, '').slice(0, 10);
    if (cleanVs) {
      parts.push(`X-VS:${cleanVs}`);
    }
  }

  if (message) {
    // Odstranění diakritiky a omezení délky na max 60 znaků podle SPAYD standardu
    const cleanMsg = message
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[*]/g, ' ')
      .slice(0, 60);
    parts.push(`MSG:${cleanMsg}`);
  }

  if (recipientName) {
    const cleanName = recipientName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[*]/g, ' ')
      .slice(0, 35);
    parts.push(`RN:${cleanName}`);
  }

  return parts.join('*') + '*';
}

/**
 * Zastaralý generátor URL externího QR obrázku.
 * Platby probíhají výhradně přes bránu Comgate; externí službě api.qrserver.com
 * nikdy neodesíláme SPAYD řetězec ani e-mail uživatele.
 */
export function getQrImageUrl(_spaydString: string, _size = 260): string {
  return '';
}
