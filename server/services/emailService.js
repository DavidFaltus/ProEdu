import 'dotenv/config';
import nodemailer from 'nodemailer';
import { escapeHtml, sanitizeHttpUrl } from '../utils/svgSanitizer.js';

const SMTP_HOST = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'; // true pro port 465, false pro 587
const SMTP_USER = (process.env.SMTP_USER || '').trim();
// Odstranění mezer z Google App Password (např. "omaq wevr ocqz dkhx" -> "omaqwevrocqzdkhx")
const SMTP_PASS = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
const SMTP_FROM = (process.env.SMTP_FROM || 'ProEdu <info@pro-edu.eu>').trim();
const ADMIN_ORDER_NOTIFICATION_EMAIL = (process.env.ADMIN_ORDER_NOTIFICATION_EMAIL || 'info@pro-edu.eu').trim();
const APP_URL = process.env.APP_URL || 'https://proeducator.eu';
const SAFE_APP_URL = sanitizeHttpUrl(APP_URL) || 'https://proeducator.eu';
const PUBLIC_ASSET_BASE_URL =
  SAFE_APP_URL && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(SAFE_APP_URL)
    ? SAFE_APP_URL.replace(/\/+$/, '')
    : 'https://www.proeducator.eu';
const BRAND_LOGO_URL = `${PUBLIC_ASSET_BASE_URL}/photo/proeducator-logo-email.png`;
const BRAND_FONT_URL = `${PUBLIC_ASSET_BASE_URL}/fonts/PetitCochon.ttf`;

function sanitizeHeaderValue(value) {
  return String(value ?? '').replace(/[\r\n\0]+/g, ' ').trim();
}

/**
 * SEC-22: Striktní validátor jediné e-mailové adresy.
 * Odmítá čárky, středníky, mezery/bílé znaky, <, >, uvozovky, CR/LF, NUL, neplatnou syntaxi a délku > 254.
 */
export function isStrictSingleEmail(value) {
  if (typeof value !== 'string') return false;
  if (/[\r\n\0]/.test(value)) return false;
  if (!value || value.length > 254) return false;
  if (/[\s,;<>'"()\\:]/.test(value)) return false;

  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) return false;

  const localPart = value.slice(0, atIndex);
  const domainPart = value.slice(atIndex + 1);
  if (localPart.length > 64 || domainPart.length < 3 || domainPart.length > 253) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) return false;
  if (!/^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+$/.test(localPart)) return false;

  const labels = domainPart.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    if (!/^[A-Za-z0-9-]+$/.test(label)) return false;
  }
  const tld = labels[labels.length - 1];
  if (!/^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/i.test(tld)) return false;

  return true;
}

function validateOptionalSingleAddress(addr) {
  if (addr === undefined || addr === null || addr === '') {
    return { ok: true, value: undefined };
  }
  if (typeof addr !== 'string' || /[\r\n\0]/.test(addr)) {
    return { ok: false, value: undefined };
  }
  const trimmed = addr.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  if (!isStrictSingleEmail(trimmed)) {
    return { ok: false, value: undefined };
  }
  return { ok: true, value: trimmed };
}

export function isEmailSimulationAllowed() {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return (
    process.env.ALLOW_DEV_TOOLS === 'true' ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    process.env.NODE_ENV !== 'production'
  );
}

let transporter = null;

export function setTransporterForTesting(customTransporter) {
  transporter = customTransporter;
}

export function resetTransporterForTesting() {
  transporter = null;
}

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      },
      tls: {
        rejectUnauthorized: true
      }
    });
    return transporter;
  } catch (err) {
    console.error('[EmailService] Chyba při inicializaci SMTP transporteru:', err);
    return null;
  }
}

/**
 * Centrální metoda pro odeslání e-mailu.
 * Pokud nejsou nastaveny SMTP proměnné, v produkci selže (fail-closed)
 * a v dev/emulator režimu simuluje odeslání bez logování citlivých OTP kódů.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text = undefined,
  replyTo = undefined,
  bcc = undefined,
  cc = undefined,
  attachments = [],
  logDetails = {}
}) {
  if (typeof to !== 'string' || /[\r\n\0]/.test(to)) {
    console.warn('[EmailService] Odmítnut neplatný příjemce e-mailu (non-string nebo CR/LF).');
    return {
      success: false,
      simulated: false,
      error: 'Neplatná e-mailová adresa příjemce.'
    };
  }
  const safeTo = to.trim();
  if (!isStrictSingleEmail(safeTo)) {
    console.warn('[EmailService] Odmítnut neplatný nebo vícenásobný příjemce e-mailu.');
    return {
      success: false,
      simulated: false,
      error: 'Neplatná e-mailová adresa příjemce.'
    };
  }

  const replyToCheck = validateOptionalSingleAddress(replyTo);
  const bccCheck = validateOptionalSingleAddress(bcc);
  const ccCheck = validateOptionalSingleAddress(cc);
  if (!replyToCheck.ok || !bccCheck.ok || !ccCheck.ok) {
    console.warn('[EmailService] Odmítnuta neplatná hlavička replyTo/cc/bcc.');
    return {
      success: false,
      simulated: false,
      error: 'Neplatná e-mailová hlavička.'
    };
  }

  const safeSubject = sanitizeHeaderValue(subject);
  const safeReplyTo = replyToCheck.value;
  const safeBcc = bccCheck.value;
  const safeCc = ccCheck.value;
  const mailClient = getTransporter();

  if (!mailClient) {
    if (!isEmailSimulationAllowed()) {
      console.error('[EmailService] SMTP není nakonfigurováno v produkčním prostředí.');
      return {
        success: false,
        simulated: false,
        error: 'E-mailová služba není nakonfigurována.'
      };
    }

    console.log('\n┌────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 📧 [PROEDU EMAIL SIMULÁTOR / DEV LOG]');
    console.log(`│ Komu:     ${safeTo}`);
    if (safeBcc) {
      console.log(`│ Bcc:      ${safeBcc}`);
    }
    if (safeCc) {
      console.log(`│ Cc:       ${safeCc}`);
    }
    if (safeReplyTo) {
      console.log(`│ Reply-To: ${safeReplyTo}`);
    }
    console.log(`│ Předmět:  ${safeSubject}`);
    if (attachments.length > 0) {
      console.log(`│ Přílohy:  ${attachments.map((a) => a.filename || 'soubor').join(', ')}`);
    }
    if (logDetails.orderId) {
      console.log(`│ 👉 OBJ.:  ${logDetails.orderId} | Částka: ${logDetails.amount} Kč | VS: ${logDetails.vs || '-'}`);
    }
    if (logDetails.resetLink) {
      console.log(`│ 🔑 ODKAZ NA RESET: ${logDetails.resetLink}`);
    }
    console.log('│ ℹ️ Pozn.:  SMTP přihlašovací údaje nejsou nastaveny v .env (používá se dev náhled).');
    console.log('└────────────────────────────────────────────────────────────────────────┘\n');

    return {
      success: true,
      simulated: true,
      messageId: `dev_${Date.now()}`
    };
  }

  try {
    const mailOptions = {
      from: SMTP_FROM,
      to: safeTo,
      replyTo: safeReplyTo,
      subject: safeSubject,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html
    };

    if (safeBcc) {
      mailOptions.bcc = safeBcc;
    }
    if (safeCc) {
      mailOptions.cc = safeCc;
    }

    if (Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const info = await mailClient.sendMail(mailOptions);

    console.log(`[EmailService] E-mail úspěšně odeslán (MessageId: ${info.messageId}).`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId
    };
  } catch (err) {
    console.error('[EmailService] Selhalo odeslání e-mailu:', err.message || err);
    return {
      success: false,
      error: 'Nepodařilo se odeslat e-mail.'
    };
  }
}

// -------------------------------------------------------------
// ŠABLONY E-MAILŮ V DESIGNU PROEDU
// -------------------------------------------------------------

function renderBrandedEmailLayout({
  accentColor = '#0fa384',
  linkColor = '#0a6f5a',
  previewText,
  headline,
  subheadline,
  bodyHtml
}) {
  const safeHeadline = escapeHtml(headline);
  const safeSubheadline = escapeHtml(subheadline);
  const safePreview = escapeHtml(previewText || headline);
  const safeAccent = escapeHtml(accentColor);
  const safeLinkColor = escapeHtml(linkColor);
  const safeLogoUrl = escapeHtml(BRAND_LOGO_URL);
  const safeFontUrl = escapeHtml(BRAND_FONT_URL);

  return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeHeadline}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'Le Petit Cochon';
      src: url('${safeFontUrl}') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    body { margin: 0; padding: 0; background-color: #faf5ee; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #26354d; -webkit-font-smoothing: antialiased; }
    a { color: ${safeLinkColor}; }
    @media only screen and (max-width: 560px) {
      .outer-pad { padding: 16px 10px !important; }
      .card-logo { padding: 24px 20px 0 !important; }
      .card-body { padding: 18px 22px 28px !important; font-size: 15px !important; }
      .card-title { font-size: 32px !important; }
      .card-footer { padding: 20px 20px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#faf5ee;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#26354d;">
  <div style="display:none;font-size:1px;color:#faf5ee;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${safePreview}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf5ee;width:100%;">
    <tr>
      <td align="center" class="outer-pad" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #efe6d8;border-radius:28px;overflow:hidden;box-shadow:0 6px 20px rgba(120,90,40,0.08);">
          <tr>
            <td style="height:10px;line-height:10px;font-size:10px;background-color:${safeAccent};">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" class="card-logo" style="padding:30px 40px 0;text-align:center;">
              <img src="${safeLogoUrl}" alt="ProEdu-cator" width="230" height="53" style="display:inline-block;width:230px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td class="card-body" style="padding:22px 44px 36px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#26354d;">
              <h1 class="card-title" style="margin:0 0 6px;text-align:center;font-family:'Le Petit Cochon','Caveat Brush','Comic Sans MS',cursive,Arial,sans-serif;font-weight:400;font-size:38px;line-height:1.15;color:#26354d;">${safeHeadline}</h1>
              <p style="margin:0 0 26px;text-align:center;font-size:15px;line-height:1.5;color:#5a6578;">${safeSubheadline}</p>
              ${bodyHtml}
              <p style="margin:26px 0 0;font-size:16px;line-height:1.65;color:#26354d;">Měj se fajn,<br><strong style="color:#26354d;">tvůj tým ProEdu</strong></p>
            </td>
          </tr>
          <tr>
            <td class="card-footer" style="background-color:#faf5ee;border-top:1px solid #efe6d8;padding:22px 40px 26px;text-align:center;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#5a6578;">
              <strong style="color:#26354d;">ProEdu, s. r. o.</strong> – příprava na přijímací zkoušky<br>
              Aplikace <a href="https://proeducator.eu" style="color:${safeLinkColor};text-decoration:underline;">proeducator.eu</a> &middot; Dotazy a podpora: <a href="mailto:info@pro-edu.eu" style="color:${safeLinkColor};text-decoration:underline;">info@pro-edu.eu</a>
              <div style="margin-top:8px;font-size:12px;color:#5a6578;">Tento e-mail byl vygenerován automaticky pro tvůj účet. Pokud jsi o nic nežádal(a), můžeš ho ignorovat.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function renderBrandedCtaButton({ href, label, bgColor, textColor = '#ffffff' }) {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
    <div style="margin:24px 0;text-align:center;">
      <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${escapeHtml(bgColor)};color:${escapeHtml(textColor)} !important;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-weight:700;font-size:16px;line-height:1.2;padding:14px 30px;border-radius:999px;box-shadow:0 4px 0 rgba(0,0,0,0.14);">${safeLabel}</a>
    </div>
  `.trim();
}

function renderTealRecapTable(rows) {
  const trHtml = rows
    .map(
      ({ label, value, highlight = false }, idx) => `
      <tr>
        <td style="padding:11px 0;${idx > 0 ? 'border-top:1px solid #c9e8de;' : ''}font-size:15px;color:#3d6b5f;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:11px 0 11px 16px;${idx > 0 ? 'border-top:1px solid #c9e8de;' : ''}font-size:15px;font-weight:700;color:${highlight ? '#0a6f5a' : '#26354d'};text-align:right;word-break:break-all;vertical-align:top;">${escapeHtml(value)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <div style="background-color:#e5f6f1;border:1px solid #c9e8de;border-radius:18px;padding:6px 20px;margin:0 0 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        ${trHtml}
      </table>
    </div>
  `.trim();
}

function renderEmailLayout({ previewText, headline, subheadline, bodyHtml }) {
  const safeHeadline = escapeHtml(headline);
  const safeSubheadline = escapeHtml(subheadline);
  const safePreview = escapeHtml(previewText || headline);
  return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeHeadline}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF7F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E1B18; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #E5E7EB; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #DCEBFE 0%, #C7DFFC 50%, #B9D8FC 100%); padding: 32px 28px; text-align: center; border-bottom: 2px solid #BFDBFE; }
    .logo { font-size: 26px; font-weight: 900; color: #0F2942; letter-spacing: -0.5px; margin-bottom: 8px; text-decoration: none; display: inline-block; }
    .logo-badge { background-color: #F5C400; color: #1E1B18; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 999px; text-transform: uppercase; margin-left: 6px; vertical-align: middle; }
    .header-title { font-size: 22px; font-weight: 800; color: #0F2942; margin: 12px 0 4px 0; }
    .header-sub { font-size: 13px; color: #284B63; margin: 0; font-weight: 500; }
    .content { padding: 32px 28px; line-height: 1.6; font-size: 15px; }
    .btn { display: inline-block; padding: 14px 28px; background-color: #2B44B8; color: #ffffff !important; font-weight: 700; font-size: 15px; border-radius: 14px; text-decoration: none; margin: 20px 0; box-shadow: 0 4px 10px rgba(43, 68, 184, 0.25); }
    .code-box { background-color: #F8FAFC; border: 2px dashed #93C5FD; border-radius: 16px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-digits { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #1E3A8A; margin: 6px 0; }
    .code-note { font-size: 12px; color: #64748B; font-weight: 500; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #F8FAFC; border-radius: 14px; overflow: hidden; border: 1px solid #E2E8F0; }
    .info-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #E2E8F0; }
    .info-table td.label { font-weight: 600; color: #64748B; width: 40%; }
    .info-table td.value { font-weight: 700; color: #0F172A; text-align: right; }
    .qr-container { text-align: center; margin: 24px 0; padding: 16px; background-color: #F8FAFC; border-radius: 16px; border: 1px solid #E2E8F0; }
    .qr-img { width: 180px; height: 180px; border-radius: 8px; }
    .footer { background-color: #F8FAFC; padding: 24px 28px; text-align: center; border-top: 1px solid #E5E7EB; font-size: 12px; color: #64748B; line-height: 1.5; }
    .footer a { color: #2B44B8; text-decoration: underline; }
  </style>
</head>
<body>
  <div style="display:none; font-size:1px; color:#333333; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${safePreview}
  </div>
  <div class="wrapper">
    <div class="header">
      <div class="logo">ProEdu<span class="logo-badge">Vzdělávání</span></div>
      <h1 class="header-title">${safeHeadline}</h1>
      <p class="header-sub">${safeSubheadline}</p>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px 0;"><strong>ProEdu</strong> – Příprava na přijímací zkoušky Cermat</p>
      <p style="margin: 0 0 10px 0;">Dotazy a podpora: <a href="mailto:info@pro-edu.eu">info@pro-edu.eu</a></p>
      <p style="margin: 0; font-size: 11px; color: #94A3B8;">Tento e-mail byl vygenerován automaticky pro váš účet v platformě ProEdu. Pokud jste tento požadavek nezadali, můžete zprávu ignorovat.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * 1. Šablona: 6místný OTP kód pro dokončení registrace
 */
export async function sendOtpEmail({ to, name, code }) {
  const safeCode = escapeHtml(code);
  const subject = 'Potvrď svůj e-mail – ověřovací kód ProEdu';
  const headline = 'Potvrď svůj e-mail';
  const subheadline = 'Dokončení registrace do ProEdu';
  const previewText = `Tvůj 6místný ověřovací kód do ProEdu je ${code}. Kód platí 15 minut.`;

  const bodyHtml = `
    <p style="margin:0 0 14px;">Ahoj,</p>
    <p style="margin:0 0 18px;">díky za registraci do <strong style="color:#26354d;">ProEdu!</strong> Pro dokončení vytvoření účtu zadej tento 6místný ověřovací kód v aplikaci:</p>

    <div style="background-color:#eaf1fd;border:1px solid #c8daf8;border-radius:18px;padding:22px 24px;text-align:center;margin:0 0 20px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#3b5d9a;margin-bottom:8px;">Jednorázový ověřovací kód</div>
      <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-variant-numeric:tabular-nums;font-size:40px;font-weight:700;letter-spacing:10px;padding-left:10px;line-height:1.15;color:#1e3a8a;margin:4px 0 10px;">${safeCode}</div>
      <div style="font-size:13px;font-weight:600;color:#3b5d9a;">Kód platí 15 minut</div>
    </div>

    <p style="margin:0;font-size:14px;line-height:1.6;color:#5a6578;">Kód stačí zkopírovat nebo opsat do registračního okna. Pokud ses do ProEdu neregistroval(a), nic se neděje – tento e-mail můžeš smazat a účet se nevytvoří.</p>
  `;

  const html = renderBrandedEmailLayout({
    accentColor: '#4a7ce0',
    linkColor: '#2e5cb8',
    previewText,
    headline,
    subheadline,
    bodyHtml
  });
  return sendEmail({
    to,
    subject,
    html,
    text: `Ahoj, díky za registraci do ProEdu! Tvůj 6místný ověřovací kód je: ${code}. Kód platí 15 minut. Pokud ses neregistroval(a), můžeš tento e-mail smazat.`
  });
}

/**
 * 2. Šablona: Objednávka vytvořena – pokyny k platbě převodem s QR kódem SPAYD
 */
export async function sendOrderQrEmail({ to, name, orderId, amount, variableSymbol, bankAccount, bankCode, bankName, qrImageUrl }) {
  const safeName = escapeHtml(name || 'zákazníku');
  const safeOrderId = escapeHtml(orderId);
  const safeAmount = escapeHtml(amount);
  const safeVs = escapeHtml(variableSymbol);
  const safeAccount = escapeHtml(bankAccount);
  const safeBankCode = escapeHtml(bankCode);
  const safeBankName = escapeHtml(bankName || 'Fio');
  const safeTo = escapeHtml(to);
  const safeQrUrl = sanitizeHttpUrl(qrImageUrl, { allowDataImage: true });

  const subject = `Pokyny k platbě objednávky č. ${sanitizeHeaderValue(orderId)} – ProEdu Premium`;
  const headline = 'Objednávka byla přijata';
  const subheadline = `Variabilní symbol: ${variableSymbol} | Částka: ${amount} Kč`;
  const previewText = `Platební údaje a QR kód pro platbu objednávky ${orderId} (${amount} Kč).`;

  const bodyHtml = `
    <p style="margin-top:0;">Dobrý den, <strong>${safeName}</strong>,</p>
    <p>děkujeme za objednávku balíčku <strong>ProEducator Premium</strong>. Níže naleznete platební instrukce pro úhradu bankovním převodem:</p>

    <table class="info-table">
      <tr>
        <td class="label">Číslo účtu:</td>
        <td class="value">${safeAccount} / ${safeBankCode} (${safeBankName})</td>
      </tr>
      <tr>
        <td class="label">Částka:</td>
        <td class="value"><span style="color:#2563EB; font-size:16px;">${safeAmount} Kč</span></td>
      </tr>
      <tr>
        <td class="label">Variabilní symbol:</td>
        <td class="value"><strong>${safeVs}</strong></td>
      </tr>
      <tr>
        <td class="label">Zpráva pro příjemce:</td>
        <td class="value">${safeTo}</td>
      </tr>
    </table>

    ${safeQrUrl ? `
    <div class="qr-container">
      <p style="margin:0 0 10px 0; font-weight:700; color:#1E3A8A; font-size:14px;">⚡ Rychlá platba mobilem (QR kód)</p>
      <img src="${escapeHtml(safeQrUrl)}" alt="QR platba SPAYD" class="qr-img" />
      <p style="margin:8px 0 0 0; font-size:12px; color:#64748B;">Naskenujte kód ve své mobilní bankovní aplikaci.</p>
    </div>
    ` : ''}

    <p style="font-size:14px; color:#475569;">
      Ihned po připsání platby na náš účet vám zašleme potvrzení a balíček <strong>ProEducator Premium</strong> se automaticky aktivuje ve vašem profilu.
    </p>
  `;

  const html = renderEmailLayout({ previewText, headline, subheadline, bodyHtml });
  return sendEmail({ to, subject, html, logDetails: { orderId, amount, vs: variableSymbol } });
}

/**
 * 3. Šablona: Potvrzení platby a aktivace předplatného ProEducator Premium
 */
export async function sendPaymentConfirmedEmail({ to, name, orderId, amount, planTitle = 'ProEducator Premium', periodEnd, invoiceNumber, attachments = [] }) {
  const safePlanTitle = escapeHtml(planTitle);
  const formattedPeriod = periodEnd ? new Date(periodEnd).toLocaleDateString('cs-CZ') : 'dle tvého tarifu';

  const subject = `Platba byla úspěšně přijata – ${sanitizeHeaderValue(planTitle)}`;
  const headline = 'Platba byla úspěšně přijata';
  const subheadline = `Balíček ${planTitle} je aktivní`;
  const previewText = `Tvoje platba ${amount} Kč dorazila v pořádku. Balíček ${planTitle} je aktivní!`;

  const recapRows = [
    { label: 'Číslo objednávky', value: String(orderId ?? '') },
    ...(invoiceNumber ? [{ label: 'Číslo faktury', value: String(invoiceNumber) }] : []),
    { label: 'Uhrazená částka', value: `${amount} Kč` },
    { label: 'Předplaceno do', value: formattedPeriod, highlight: true },
    { label: 'Stav účtu', value: 'Aktivní (Premium)' }
  ];

  const premiumBenefits = [
    'Neomezené procvičování bez žolíků a čekání',
    'Podrobné statistiky a chytrá doporučení k procvičování',
    'Chytrý studijní plánovač v kalendáři',
    'Přehledné grafické listy',
    '100% bez reklam a přerušování',
    'Všechny budoucí funkce v ceně 99 Kč'
  ];

  const benefitsHtml = premiumBenefits
    .map(
      (item, idx) => `
      <tr>
        <td style="width:22px;padding:${idx === 0 ? '0' : '6px'} 8px 0 0;vertical-align:top;font-size:14px;font-weight:700;color:#0fa384;">&#10003;</td>
        <td style="padding:${idx === 0 ? '0' : '6px'} 0 0 0;vertical-align:top;font-size:14px;line-height:1.5;color:#26354d;${idx === premiumBenefits.length - 1 ? 'font-weight:700;' : ''}">${escapeHtml(item)}</td>
      </tr>
    `
    )
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 14px;">Ahoj,</p>
    <p style="margin:0 0 14px;">tvoje platba dorazila v pořádku a balíček <strong style="color:#26354d;">${safePlanTitle}</strong> je aktivní. Tady je rekapitulace:</p>

    ${renderTealRecapTable(recapRows)}

    ${attachments.length > 0 ? `<p style="margin:0;font-size:14px;color:#5a6578;">Fakturu / daňový doklad najdeš v příloze tohoto e-mailu (PDF).</p>` : ''}

    ${renderBrandedCtaButton({
      href: `${SAFE_APP_URL}/dashboard`,
      label: 'Vstoupit do aplikace ProEdu',
      bgColor: '#0fa384',
      textColor: '#ffffff'
    })}

    <div style="background-color:#f4fbf9;border:1px solid #c9e8de;border-radius:18px;padding:16px 20px;margin:0 0 14px;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0a6f5a;">Co všechno máš s ProEdu Premium k dispozici:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        ${benefitsHtml}
      </table>
    </div>

    <p style="margin:0;">Ať se ti při učení daří!</p>
  `;

  const html = renderBrandedEmailLayout({
    accentColor: '#0fa384',
    linkColor: '#0a6f5a',
    previewText,
    headline,
    subheadline,
    bodyHtml
  });
  const normalizedTo = typeof to === 'string' ? to.trim().toLowerCase() : '';
  const bcc = (ADMIN_ORDER_NOTIFICATION_EMAIL && ADMIN_ORDER_NOTIFICATION_EMAIL.toLowerCase() !== normalizedTo)
    ? ADMIN_ORDER_NOTIFICATION_EMAIL
    : undefined;
  return sendEmail({ to, bcc, subject, html, attachments, logDetails: { orderId, amount } });
}

/**
 * 4. Šablona: Notifikace o úspěšném automatickém stržení opakované platby (Comgate recurring)
 * Vyžadováno pravidly karetních asociací Visa/Mastercard.
 */
export async function sendRecurringChargeSuccessEmail({ to, name, orderId, amount, nextPeriodEnd, invoiceNumber, attachments = [] }) {
  const formattedPeriod = nextPeriodEnd ? new Date(nextPeriodEnd).toLocaleDateString('cs-CZ') : '';

  const subject = `Předplatné ProEducator Premium bylo prodlouženo (${sanitizeHeaderValue(amount)} Kč)`;
  const headline = 'Předplatné bylo prodlouženo';
  const subheadline = `Měsíční platba ${amount} Kč proběhla v pořádku`;
  const previewText = `Tvoje předplatné ProEducator Premium bylo automaticky prodlouženo do ${formattedPeriod}.`;

  const recapRows = [
    { label: 'Číslo transakce', value: String(orderId ?? '') },
    ...(invoiceNumber ? [{ label: 'Číslo faktury', value: String(invoiceNumber) }] : []),
    { label: 'Uhrazená částka', value: `${amount} Kč` },
    { label: 'Předplaceno do', value: formattedPeriod, highlight: true },
    { label: 'Stav účtu', value: 'Aktivní (Premium)' }
  ];

  const bodyHtml = `
    <p style="margin:0 0 14px;">Ahoj,</p>
    <p style="margin:0 0 14px;">tvoje pravidelná měsíční platba za <strong style="color:#26354d;">ProEducator Premium</strong> přes platební bránu Comgate proběhla v pořádku. Tady je rekapitulace:</p>

    ${renderTealRecapTable(recapRows)}

    ${attachments.length > 0 ? `<p style="margin:0;font-size:14px;color:#5a6578;">Fakturu / daňový doklad za toto období najdeš v příloze tohoto e-mailu (PDF).</p>` : ''}

    ${renderBrandedCtaButton({
      href: `${SAFE_APP_URL}/dashboard`,
      label: 'Vstoupit do aplikace ProEdu',
      bgColor: '#0fa384',
      textColor: '#ffffff'
    })}

    <p style="margin:0;font-size:14px;color:#5a6578;">Podrobnosti o předplatném nebo jeho zrušení najdeš kdykoliv ve svém profilu v sekci <a href="${escapeHtml(SAFE_APP_URL)}/settings?tab=subscription" style="color:#0a6f5a;text-decoration:underline;">Nastavení účtu</a>.</p>
  `;

  const html = renderBrandedEmailLayout({
    accentColor: '#0fa384',
    linkColor: '#0a6f5a',
    previewText,
    headline,
    subheadline,
    bodyHtml
  });
  const normalizedTo = typeof to === 'string' ? to.trim().toLowerCase() : '';
  const bcc = (ADMIN_ORDER_NOTIFICATION_EMAIL && ADMIN_ORDER_NOTIFICATION_EMAIL.toLowerCase() !== normalizedTo)
    ? ADMIN_ORDER_NOTIFICATION_EMAIL
    : undefined;
  return sendEmail({ to, bcc, subject, html, attachments, logDetails: { orderId, amount } });
}

/**
 * 5. Šablona: Upozornění na selhání automatické opakované platby
 */
export async function sendRecurringChargeFailedEmail({ to, name, amount, reason }) {
  const safeAmount = escapeHtml(amount);
  const rawReason = reason || 'Karta byla zamítnuta vydavatelskou bankou';
  const safeReason = escapeHtml(rawReason);

  const subject = 'Nepodařilo se obnovit tvoje předplatné ProEducator Premium';
  const headline = 'Platba za Premium neprošla';
  const subheadline = 'Aktualizuj prosím svou platební kartu';
  const previewText = `Automatická platba za ProEducator Premium (${amount} Kč) neprošla. Běží 3denní ochranná lhůta.`;

  const bodyHtml = `
    <p style="margin:0 0 14px;">Ahoj,</p>
    <p style="margin:0 0 14px;">při automatickém prodloužení tvého předplatného <strong style="color:#26354d;">ProEducator Premium</strong> (${safeAmount} Kč) se platbu nepodařilo strhnout.</p>

    <div style="background-color:#f8e9f0;border:1px solid #efcddd;border-radius:18px;padding:16px 20px;font-size:15px;line-height:1.55;color:#6b2f4a;margin:0 0 16px;">
      <strong>Důvod:</strong> ${safeReason}<br>
      Aby ti výhody Premium zůstaly aktivní, běží teď <strong>3denní ochranná lhůta</strong>, během které platbu zkusíme strhnout znovu.
    </div>

    <p style="margin:0;">Platební kartu můžeš kdykoliv hned aktualizovat v nastavení svého předplatného:</p>

    ${renderBrandedCtaButton({
      href: `${SAFE_APP_URL}/settings?tab=subscription`,
      label: 'Aktualizovat platební kartu',
      bgColor: '#c47294',
      textColor: '#ffffff'
    })}
  `;

  const html = renderBrandedEmailLayout({
    accentColor: '#c47294',
    linkColor: '#7e3b59',
    previewText,
    headline,
    subheadline,
    bodyHtml
  });
  const normalizedTo = typeof to === 'string' ? to.trim().toLowerCase() : '';
  const bcc = (ADMIN_ORDER_NOTIFICATION_EMAIL && ADMIN_ORDER_NOTIFICATION_EMAIL.toLowerCase() !== normalizedTo)
    ? ADMIN_ORDER_NOTIFICATION_EMAIL
    : undefined;
  return sendEmail({ to, bcc, subject, html });
}

/**
 * SEC-36: Povolené originy pro klikatelné odkazy na stránku v hlášení chyby.
 * Externí nebo neplatné URL se v admin e-mailu vykreslí výhradně jako prostý escapovaný text.
 */
const ALLOWED_BUG_REPORT_ORIGINS = new Set([
  'https://www.proeducator.eu',
  'https://proeducator.eu'
]);
const ALLOWED_BUG_STORAGE_BUCKETS = [
  'gen-lang-client-0972842509.appspot.com',
  'gen-lang-client-0972842509.firebasestorage.app'
];
const STRICT_BUG_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i;

export function sanitizeAllowedBugReportPageUrl(rawUrl) {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return '';
  try {
    const parsed = new URL(safe);
    if (ALLOWED_BUG_REPORT_ORIGINS.has(parsed.origin)) {
      return parsed.toString();
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * SEC-36: Pro screenshot v hlášení chyby povolujeme výhradně inline rastrové data:image/(png|jpeg|webp);base64
 * nebo Firebase Storage URL projektu gen-lang-client-0972842509 (nikdy libovolné externí tracking <img> URL).
 */
export function sanitizeAllowedBugReportScreenshotUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  const cleaned = rawUrl.replace(/[\u0000-\u001f\u007f]+/g, '').trim();
  if (!cleaned) return '';

  const compact = cleaned.replace(/\s+/g, '');
  if (STRICT_BUG_DATA_IMAGE_RE.test(compact)) {
    return compact;
  }

  const safeHttp = sanitizeHttpUrl(cleaned);
  if (!safeHttp) return '';
  try {
    const parsed = new URL(safeHttp);
    if (parsed.protocol !== 'https:') return '';
    let decodedPathname = parsed.pathname;
    try {
      decodedPathname = decodeURIComponent(parsed.pathname);
    } catch {
      return '';
    }
    if (
      parsed.pathname.split('/').includes('..') ||
      decodedPathname.split('/').includes('..') ||
      decodedPathname.includes('\\')
    ) {
      return '';
    }

    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const allowedPrefix = ALLOWED_BUG_STORAGE_BUCKETS.some((bucket) =>
        parsed.pathname.startsWith(`/v0/b/${bucket}/`)
      );
      return allowedPrefix ? parsed.toString() : '';
    }

    if (parsed.hostname === 'storage.googleapis.com') {
      const allowedPrefix = ALLOWED_BUG_STORAGE_BUCKETS.some((bucket) =>
        parsed.pathname.startsWith(`/${bucket}/`)
      );
      return allowedPrefix ? parsed.toString() : '';
    }

    return '';
  } catch {
    return '';
  }
}

export function resolveBugReportRecipient(explicitTo = undefined) {
  const candidates = [explicitTo, process.env.BUG_REPORT_EMAIL, process.env.ADMIN_EMAIL];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || /[\r\n\0]/.test(raw)) continue;
    const trimmed = raw.trim();
    if (trimmed && isStrictSingleEmail(trimmed)) {
      return trimmed;
    }
  }
  return '';
}

/**
 * 6. Šablona: Hlášení chyby od studenta pro administrátory
 */
export async function sendBugReportEmail({
  to = undefined,
  studentName = undefined,
  studentEmail = undefined,
  category = undefined,
  categoryLabel = undefined,
  description = undefined,
  pageUrl = undefined,
  userAgent = undefined,
  screenResolution = undefined,
  screenshotUrl = undefined,
  reportId = undefined
}) {
  const recipient = resolveBugReportRecipient(to);
  if (!recipient) {
    console.warn('[EmailService] BUG_REPORT_EMAIL / ADMIN_EMAIL není nakonfigurováno — e-mail s hlášením chyby nebyl odeslán.');
    return {
      success: false,
      skipped: true,
      simulated: false,
      error: 'BUG_REPORT_EMAIL není nakonfigurováno.'
    };
  }

  const displayCategory = categoryLabel || category || 'Chyba';
  const safeCategory = escapeHtml(displayCategory);
  const safeStudentName = escapeHtml(studentName || 'Student');
  const safeStudentEmail = escapeHtml(studentEmail || '');
  const safeUserAgent = escapeHtml(userAgent || 'Neuvedeno');
  const safeResolution = escapeHtml(screenResolution || 'Neuvedeno');
  const safeReportId = reportId ? escapeHtml(reportId) : '';
  const safePageUrlHref = sanitizeAllowedBugReportPageUrl(pageUrl);
  const safePageUrlDisplay = escapeHtml(pageUrl || 'Neuvedeno');
  const safeScreenshotUrl = sanitizeAllowedBugReportScreenshotUrl(screenshotUrl);
  const mailtoUrl = sanitizeHttpUrl(`mailto:${studentEmail || ''}`, { allowMailto: true });

  const attachments = [];
  let inlineScreenshotSrc = safeScreenshotUrl;
  let isInlineAttachment = false;

  if (safeScreenshotUrl && safeScreenshotUrl.startsWith('data:image/')) {
    const match = safeScreenshotUrl.match(/^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (match) {
      const mimeType = match[1].toLowerCase();
      const rawExt = match[2].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      const base64Data = match[3];
      const cid = `bug-screenshot-${reportId || Date.now()}@proedu`;
      attachments.push({
        filename: `screenshot-${reportId || Date.now()}.${ext}`,
        content: Buffer.from(base64Data, 'base64'),
        contentType: mimeType,
        cid
      });
      inlineScreenshotSrc = `cid:${cid}`;
      isInlineAttachment = true;
    }
  }

  const subject = `🐞 [Chyba ProEdu] ${sanitizeHeaderValue(displayCategory)}: ${sanitizeHeaderValue(studentName || studentEmail)}`;
  const headline = 'Nové hlášení chyby od studenta';
  const subheadline = `Kategorie: ${displayCategory} | Student: ${studentName || studentEmail}`;
  const previewText = `Nahlášena chyba (${displayCategory}): ${(description || '').slice(0, 100)}...`;

  const safeDescription = escapeHtml(description || '').replace(/\r?\n/g, '<br/>');

  const bodyHtml = `
    <p style="margin-top:0;">Dobrý den,</p>
    <p>student <strong>${safeStudentName}</strong> (<code>${safeStudentEmail}</code>) právě nahlásil chybu v aplikaci <strong>ProEdu</strong>.</p>

    <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #991B1B; margin-bottom: 6px;">
        Kategorie: ${safeCategory}
      </div>
      <div style="font-size: 15px; color: #1E1B18; line-height: 1.6;">
        ${safeDescription}
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td class="label">Odesílatel:</td>
        <td class="value"><strong>${safeStudentName}</strong> (${safeStudentEmail})</td>
      </tr>
      <tr>
        <td class="label">Stránka (URL):</td>
        <td class="value">${
          safePageUrlHref
            ? `<a href="${escapeHtml(safePageUrlHref)}" style="color:#2563EB; word-break: break-all;">${safePageUrlDisplay}</a>`
            : `<span style="color:#475569; word-break: break-all;">${safePageUrlDisplay}</span>`
        }</td>
      </tr>
      <tr>
        <td class="label">Zařízení / Prohlížeč:</td>
        <td class="value" style="font-size:12px; color:#475569;">${safeUserAgent}</td>
      </tr>
      <tr>
        <td class="label">Rozlišení obrazovky:</td>
        <td class="value">${safeResolution}</td>
      </tr>
      ${safeReportId ? `
      <tr>
        <td class="label">ID hlášení:</td>
        <td class="value"><code>${safeReportId}</code></td>
      </tr>
      ` : ''}
    </table>

    ${safeScreenshotUrl ? `
      <div style="margin: 24px 0; text-align: center;">
        <p style="font-weight: 700; color: #1E1B18; margin-bottom: 10px;">Přiložený snímek obrazovky:</p>
        <div style="display:inline-block; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; max-width: 100%;">
          <img src="${escapeHtml(inlineScreenshotSrc)}" alt="Screenshot chyby" style="max-width: 100%; max-height: 400px; display: block; margin: 0 auto;" />
        </div>
        ${!isInlineAttachment ? `<p style="margin-top: 6px; font-size: 12px;"><a href="${escapeHtml(safeScreenshotUrl)}" target="_blank" rel="noopener noreferrer" style="color: #2563EB;">Otevřít obrázek v plné velikosti ↗</a></p>` : `<p style="margin-top: 6px; font-size: 12px; color: #64748B;">Snímek obrazovky je přiložen také jako soubor v příloze tohoto e-mailu.</p>`}
      </div>
    ` : ''}

    ${mailtoUrl ? `
    <div style="text-align: center; margin: 28px 0 10px 0;">
      <a href="${escapeHtml(mailtoUrl)}?subject=Re:%20Va%C5%A1e%20hl%C3%A1%C5%A1en%C3%AD%20chyby%20v%20ProEdu" class="btn" style="background-color: #B80053;">
        Odpovědět studentovi na e-mail
      </a>
    </div>
    ` : ''}

    <p style="font-size: 12px; color: #64748B; text-align: center;">
      Nebo můžete hlášení spravovat přímo v <a href="${escapeHtml(SAFE_APP_URL)}/teacher-dashboard?tab=bugReports" style="color: #2563EB;">Teacher Dashboardu</a>.
    </p>
  `;

  const html = renderEmailLayout({ previewText, headline, subheadline, bodyHtml });
  const safeReplyToStudent =
    typeof studentEmail === 'string' && !/[\r\n\0]/.test(studentEmail) && isStrictSingleEmail(studentEmail.trim())
      ? studentEmail.trim()
      : undefined;
  return sendEmail({
    to: recipient,
    replyTo: safeReplyToStudent,
    subject,
    html,
    attachments,
    logDetails: { reportId, category }
  });
}

/**
 * 7. Šablona: Obnovení zapomenutého hesla
 */
export async function sendPasswordResetEmailTemplate({ to, name, resetLink }) {
  const safeLink = sanitizeHttpUrl(resetLink) || resetLink;
  const escapedLink = escapeHtml(safeLink);
  const subject = 'Nastav si nové heslo – ProEdu';
  const headline = 'Nastav si nové heslo';
  const subheadline = 'Obnovení zapomenutého hesla';
  const previewText = 'Požadavek na obnovení zapomenutého hesla k účtu ProEdu. Odkaz platí 1 hodinu.';

  const bodyHtml = `
    <p style="margin:0 0 14px;">Ahoj,</p>
    <p style="margin:0 0 14px;">požádal(a) jsi o obnovení zapomenutého hesla. Klikni na tlačítko a nastav si nové.</p>

    ${renderBrandedCtaButton({
      href: safeLink,
      label: 'Nastavit nové heslo',
      bgColor: '#f5c400',
      textColor: '#26354d'
    })}

    <p style="margin:0 0 4px;font-size:14px;color:#5a6578;">Pokud tlačítko nefunguje, zkopíruj tento odkaz do prohlížeče:</p>
    <p style="margin:0 0 20px;font-size:14px;word-break:break-all;color:#7a5a00;">
      <a href="${escapedLink}" style="color:#7a5a00;text-decoration:underline;word-break:break-all;">${escapedLink}</a>
    </p>

    <div style="background-color:#fff6d1;border:1px solid #f1dc8a;border-radius:18px;padding:16px 20px;font-size:15px;line-height:1.55;color:#5a4300;">
      <strong>Pozor, odkaz platí jen 1 hodinu.</strong> Pokud jsi o obnovení hesla nežádal(a), nic se neděje – tvůj účet je v bezpečí a e-mail můžeš smazat.
    </div>
  `;

  const html = renderBrandedEmailLayout({
    accentColor: '#f5c400',
    linkColor: '#7a5a00',
    previewText,
    headline,
    subheadline,
    bodyHtml
  });
  return sendEmail({ to, subject, html, logDetails: { resetLink } });
}

/**
 * 8. Šablona: Potvrzení o zrušení předplatného a opakovaných plateb
 */
export async function sendSubscriptionCancelledEmail({ to, name, periodEnd, immediate = false }) {
  const formattedEndDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : null;
  const isActiveUntilEnd = !immediate && Boolean(formattedEndDate);

  const subject = 'Automatické platby jsou zrušené – ProEdu';
  const headline = 'Automatické platby jsou zrušené';
  const subheadline = isActiveUntilEnd
    ? `Výhody Premium ti běží do ${formattedEndDate}`
    : 'Předplatné bylo okamžitě ukončeno';
  const previewText = isActiveUntilEnd
    ? `Tvoje automatické platby jsme zrušili. Výhody Premium ti běží do ${formattedEndDate}.`
    : 'Tvoje automatické platby jsme zrušili a předplatné skončilo. Z tvé karty už žádná další platba neproběhne.';

  const introParagraph = isActiveUntilEnd
    ? `tvoje automatické platby jsme zrušili. Všechny výhody <strong style="color:#26354d;">ProEducator Premium</strong> můžeš dál naplno využívat až do <strong style="color:#26354d;">${escapeHtml(formattedEndDate)}</strong>, pak se účet přepne na bezplatný tarif.`
    : 'tvoje automatické platby jsme zrušili a předplatné skončilo.';

  const bodyHtml = `
    <p style="margin:0 0 14px;">Ahoj,</p>
    <p style="margin:0 0 14px;">${introParagraph}</p>

    <div style="background-color:#f8e9f0;border:1px solid #efcddd;border-radius:18px;padding:16px 20px;font-size:15px;line-height:1.55;color:#6b2f4a;">
      <strong>Z tvé platební karty už žádná další platba neproběhne.</strong>
    </div>

    <p style="margin:16px 0 0;">Pokud se k Premium budeš někdy chtít vrátit, stačí si tarif znovu aktivovat ve svém profilu.</p>

    ${renderBrandedCtaButton({
      href: `${SAFE_APP_URL}/settings?tab=subscription`,
      label: 'Přejít do profilu',
      bgColor: '#c47294',
      textColor: '#ffffff'
    })}
  `;

  const html = renderBrandedEmailLayout({
    accentColor: '#c47294',
    linkColor: '#7e3b59',
    previewText,
    headline,
    subheadline,
    bodyHtml
  });
  const normalizedTo = typeof to === 'string' ? to.trim().toLowerCase() : '';
  const bcc = (ADMIN_ORDER_NOTIFICATION_EMAIL && ADMIN_ORDER_NOTIFICATION_EMAIL.toLowerCase() !== normalizedTo)
    ? ADMIN_ORDER_NOTIFICATION_EMAIL
    : undefined;
  return sendEmail({
    to,
    bcc,
    subject,
    html,
    text: isActiveUntilEnd
      ? `Ahoj, tvoje automatické platby jsme zrušili. Z tvé platební karty už žádná další platba neproběhne. Výhody Premium můžeš využívat až do ${formattedEndDate}.`
      : 'Ahoj, tvoje automatické platby jsme zrušili a předplatné skončilo. Z tvé platební karty už žádná další platba neproběhne.'
  });
}
