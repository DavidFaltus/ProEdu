/**
 * Utilita pro generování českých platebních QR kódů podle standardu SPAYD (Short Payment Descriptor).
 * Standard ČBA (Česká bankovní asociace) podporovaný všemi českými bankami.
 */

/**
 * Převod českého čísla účtu a kódu banky na mezinárodní formát IBAN.
 */
export function czechAccountToIban(accountNumberRaw: string, bankCodeRaw: string): string {
  const bankCode = bankCodeRaw.trim().padStart(4, '0');
  
  // Rozdělení na předčíslí a samotné číslo účtu (např. 19-123456789 nebo jen 123456789)
  let prefix = '000000';
  let account = accountNumberRaw.trim();
  
  if (account.includes('-')) {
    const parts = account.split('-');
    prefix = parts[0].padStart(6, '0');
    account = parts[1];
  }
  
  const paddedAccount = account.padStart(10, '0');
  const bban = `${bankCode}${prefix}${paddedAccount}`;
  
  // CZ = 12 35, 00 pro výpočet kontrolních číslic
  const numericString = `${bban}123500`;
  
  // Výpočet modulo 97 pro dlouhé číslo
  let remainder = 0;
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder * 10 + parseInt(numericString[i], 10)) % 97;
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
 * Vygeneruje URL obrázku QR kódu z dat SPAYD.
 */
export function getQrImageUrl(spaydString: string, size = 260): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&format=svg&data=${encodeURIComponent(spaydString)}`;
}
