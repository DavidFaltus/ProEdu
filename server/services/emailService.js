import 'dotenv/config';
import nodemailer from 'nodemailer';

const SMTP_HOST = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'; // true pro port 465, false pro 587
const SMTP_USER = (process.env.SMTP_USER || '').trim();
// Odstranění mezer z Google App Password (např. "omaq wevr ocqz dkhx" -> "omaqwevrocqzdkhx")
const SMTP_PASS = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
const SMTP_FROM = (process.env.SMTP_FROM || 'ProEdu <info@pro-edu.eu>').trim();
const APP_URL = process.env.APP_URL || 'http://localhost:3005';

let transporter = null;

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
        rejectUnauthorized: process.env.NODE_ENV === 'production'
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
 * Pokud nejsou nastaveny SMTP proměnné, zaloguje náhled do konzole pro lokální testování.
 */
export async function sendEmail({ to, subject, html, text, replyTo, attachments = [], logDetails = {} }) {
  const mailClient = getTransporter();

  if (!mailClient) {
    console.log('\n┌────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 📧 [PROEDU EMAIL SIMULÁTOR / DEV LOG]');
    console.log(`│ Komu:     ${to}`);
    if (replyTo) {
      console.log(`│ Reply-To: ${replyTo}`);
    }
    console.log(`│ Předmět:  ${subject}`);
    if (attachments.length > 0) {
      console.log(`│ Přílohy:  ${attachments.map(a => a.filename || 'soubor').join(', ')}`);
    }
    if (logDetails.code) {
      console.log(`│ 👉 KÓD:   ${logDetails.code}  (Platnost: 15 minut)`);
    }
    if (logDetails.orderId) {
      console.log(`│ 👉 OBJ.:  ${logDetails.orderId} | Částka: ${logDetails.amount} Kč | VS: ${logDetails.vs}`);
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
      to,
      replyTo: replyTo || undefined,
      subject,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const info = await mailClient.sendMail(mailOptions);

    console.log(`[EmailService] E-mail "${subject}" úspěšně odeslán na ${to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId
    };
  } catch (err) {
    console.error(`[EmailService] Selhalo odeslání e-mailu na ${to}:`, err.message || err);
    return {
      success: false,
      error: err.message || 'Nepodařilo se odeslat e-mail.'
    };
  }
}

// -------------------------------------------------------------
// ŠABLONY E-MAILŮ V DESIGNU PROEDU
// -------------------------------------------------------------

function renderEmailLayout({ previewText, headline, subheadline, bodyHtml }) {
  return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
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
    ${previewText || headline}
  </div>
  <div class="wrapper">
    <div class="header">
      <div class="logo">ProEdu<span class="logo-badge">Vzdělávání</span></div>
      <h1 class="header-title">${headline}</h1>
      <p class="header-sub">${subheadline}</p>
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
  const subject = `Váš ověřovací kód ProEdu: ${code}`;
  const headline = 'Ověření e-mailové adresy';
  const subheadline = 'Dokončení registrace vašeho účtu ProEdu';
  const previewText = `Váš 6místný ověřovací kód je ${code}. Platnost 15 minut.`;

  const bodyHtml = `
    <p style="margin-top:0;">Ahoj <strong>${name || 'studente'}</strong>,</p>
    <p>děkujeme za registraci do vzdělávací platformy <strong>ProEdu</strong>. Pro dokončení vytvoření účtu a ověření vaší e-mailové adresy zadejte prosím následující šestimístný kód:</p>
    
    <div class="code-box">
      <div class="code-note">JEDNORÁZOVÝ OVĚŘOVACÍ KÓD</div>
      <div class="code-digits">${code}</div>
      <div class="code-note">⏱️ Kód je platný <strong>15 minut</strong></div>
    </div>

    <p style="color:#475569; font-size:14px;">Kód zadejte do okna v aplikaci. Pokud jste se neregistrovali, tento e-mail jednoduše ignorujte – účet nebude aktivován.</p>
  `;

  const html = renderEmailLayout({ previewText, headline, subheadline, bodyHtml });
  return sendEmail({ to, subject, html, logDetails: { code } });
}

/**
 * 2. Šablona: Objednávka vytvořena – pokyny k platbě převodem s QR kódem SPAYD
 */
export async function sendOrderQrEmail({ to, name, orderId, amount, variableSymbol, bankAccount, bankCode, bankName, qrImageUrl }) {
  const subject = `Pokyny k platbě objednávky č. ${orderId} – ProEdu Premium`;
  const headline = 'Objednávka byla přijata';
  const subheadline = `Variabilní symbol: ${variableSymbol} | Částka: ${amount} Kč`;
  const previewText = `Platební údaje a QR kód pro platbu objednávky ${orderId} (${amount} Kč).`;

  const bodyHtml = `
    <p style="margin-top:0;">Dobrý den, <strong>${name || 'zákazníku'}</strong>,</p>
    <p>děkujeme za objednávku balíčku <strong>ProEducator Premium</strong>. Níže naleznete platební instrukce pro úhradu bankovním převodem:</p>

    <table class="info-table">
      <tr>
        <td class="label">Číslo účtu:</td>
        <td class="value">${bankAccount} / ${bankCode} (${bankName || 'Fio'})</td>
      </tr>
      <tr>
        <td class="label">Částka:</td>
        <td class="value"><span style="color:#2563EB; font-size:16px;">${amount} Kč</span></td>
      </tr>
      <tr>
        <td class="label">Variabilní symbol:</td>
        <td class="value"><strong>${variableSymbol}</strong></td>
      </tr>
      <tr>
        <td class="label">Zpráva pro příjemce:</td>
        <td class="value">${to}</td>
      </tr>
    </table>

    ${qrImageUrl ? `
    <div class="qr-container">
      <p style="margin:0 0 10px 0; font-weight:700; color:#1E3A8A; font-size:14px;">⚡ Rychlá platba mobilem (QR kód)</p>
      <img src="${qrImageUrl}" alt="QR platba SPAYD" class="qr-img" />
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
  const subject = `Potvrzení platby – Váš balíček ${planTitle} je aktivní!`;
  const headline = 'Platba byla úspěšně přijata';
  const subheadline = `Balíček ${planTitle} byl aktivován`;
  const previewText = `Vaše platba ve výši ${amount} Kč byla schválena. Prémiové funkce jsou vám k dispozici!`;

  const formattedPeriod = periodEnd ? new Date(periodEnd).toLocaleDateString('cs-CZ') : 'dle vašeho tarifu';

  const bodyHtml = `
    <p style="margin-top:0;">Dobrý den, <strong>${name || 'studente'}</strong>,</p>
    <p>s radostí potvrzujeme, že vaše platba za balíček <strong>${planTitle}</strong> proběhla v pořádku a prémiové funkce máte okamžitě k dispozici!</p>

    <table class="info-table">
      <tr>
        <td class="label">Číslo objednávky:</td>
        <td class="value">${orderId}</td>
      </tr>
      ${invoiceNumber ? `
      <tr>
        <td class="label">Číslo faktury:</td>
        <td class="value"><strong>${invoiceNumber}</strong></td>
      </tr>
      ` : ''}
      <tr>
        <td class="label">Uhrazená částka:</td>
        <td class="value"><strong>${amount} Kč</strong></td>
      </tr>
      <tr>
        <td class="label">Předplaceno do:</td>
        <td class="value"><span style="color:#16A34A; font-weight:800;">${formattedPeriod}</span></td>
      </tr>
      <tr>
        <td class="label">Stav účtu:</td>
        <td class="value">Aktivní (Premium)</td>
      </tr>
    </table>

    ${attachments.length > 0 ? `<p style="font-size:13px; color:#334155;">📄 Fakturu / daňový doklad naleznete přiloženou v příloze tohoto e-mailu (PDF).</p>` : ''}

    <div style="text-align: center; margin: 28px 0;">
      <a href="${APP_URL}/dashboard" class="btn">Vstoupit do aplikace ProEdu</a>
    </div>

    <p style="font-size:14px; color:#475569;">
      Jako Premium uživatel máte neomezený přístup ke všem testům, detailním rozborům a procvičování bez reklamních limitů. Přejeme hodně úspěchů při studiu!
    </p>
  `;

  const html = renderEmailLayout({ previewText, headline, subheadline, bodyHtml });
  return sendEmail({ to, subject, html, attachments, logDetails: { orderId, amount } });
}

/**
 * 4. Šablona: Notifikace o úspěšném automatickém stržení opakované platby (Comgate recurring)
 * Vyžadováno pravidly karetních asociací Visa/Mastercard.
 */
export async function sendRecurringChargeSuccessEmail({ to, name, orderId, amount, nextPeriodEnd, invoiceNumber, attachments = [] }) {
  const subject = `Potvrzení o prodloužení předplatného ProEducator Premium (${amount} Kč)`;
  const headline = 'Předplatné bylo úspěšně prodlouženo';
  const subheadline = `Měsíční platba ${amount} Kč byla zprocesována`;
  const previewText = `Vaše předplatné ProEducator Premium bylo automaticky prodlouženo do ${new Date(nextPeriodEnd).toLocaleDateString('cs-CZ')}.`;

  const formattedPeriod = nextPeriodEnd ? new Date(nextPeriodEnd).toLocaleDateString('cs-CZ') : '';

  const bodyHtml = `
    <p style="margin-top:0;">Dobrý den, <strong>${name || 'zákazníku'}</strong>,</p>
    <p>potvrzujeme úspěšné automatické stržení pravidelné měsíční platby za vaše předplatné <strong>ProEducator Premium</strong> prostřednictvím platební brány Comgate.</p>

    <table class="info-table">
      <tr>
        <td class="label">Číslo transakce:</td>
        <td class="value">${orderId}</td>
      </tr>
      ${invoiceNumber ? `
      <tr>
        <td class="label">Číslo faktury:</td>
        <td class="value"><strong>${invoiceNumber}</strong></td>
      </tr>
      ` : ''}
      <tr>
        <td class="label">Částka:</td>
        <td class="value"><strong>${amount} Kč</strong></td>
      </tr>
      <tr>
        <td class="label">Platnost do:</td>
        <td class="value"><span style="color:#16A34A; font-weight:800;">${formattedPeriod}</span></td>
      </tr>
    </table>

    ${attachments.length > 0 ? `<p style="font-size:13px; color:#334155;">📄 Fakturu / daňový doklad za toto období naleznete v příloze (PDF).</p>` : ''}

    <p style="font-size:13px; color:#64748B;">
      Podrobnosti o předplatném nebo případné zrušení můžete kdykoliv provést přímo ve svém profilu v sekci <a href="${APP_URL}/settings">Nastavení účtu</a>.
    </p>
  `;

  const html = renderEmailLayout({ previewText, headline, subheadline, bodyHtml });
  return sendEmail({ to, subject, html, attachments, logDetails: { orderId, amount } });
}

/**
 * 5. Šablona: Upozornění na selhání automatické opakované platby
 */
export async function sendRecurringChargeFailedEmail({ to, name, amount, reason }) {
  const subject = `Upozornění: Nepodařilo se obnovit vaše předplatné ProEducator Premium`;
  const headline = 'Platba předplatného se nezdařila';
  const subheadline = 'Je vyžadována aktualizace platební karty';
  const previewText = `Automatická platba za ProEducator Premium selhala (${reason || 'Zamítnuto bankou'}).`;

  const bodyHtml = `
    <p style="margin-top:0;">Dobrý den, <strong>${name || 'zákazníku'}</strong>,</p>
    <p>při pokusu o automatické obnovení vašeho předplatného <strong>ProEducator Premium</strong> (${amount} Kč) došlo k chybě: <em>${reason || 'Karta byla zamítnuta vydavatelskou bankou'}</em>.</p>
    
    <p>Aby vaše prémiové funkce a přístup k výukovým materiálům zůstaly zachovány, zkontrolujte prosím stav platební karty nebo obnovte předplatné v aplikaci:</p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${APP_URL}/settings" class="btn">Aktualizovat předplatné</a>
    </div>
  `;

  const html = renderEmailLayout({ previewText, headline, subheadline, bodyHtml });
  return sendEmail({ to, subject, html });
}

/**
 * 6. Šablona: Hlášení chyby od studenta pro administrátory
 */
export async function sendBugReportEmail({
  to = 'netkova.nela@gmail.com',
  studentName,
  studentEmail,
  category,
  categoryLabel,
  description,
  pageUrl,
  userAgent,
  screenResolution,
  screenshotUrl,
  reportId
}) {
  const displayCategory = categoryLabel || category || 'Chyba';
  const subject = `🐞 [Chyba ProEdu] ${displayCategory}: ${studentName || studentEmail}`;
  const headline = 'Nové hlášení chyby od studenta';
  const subheadline = `Kategorie: ${displayCategory} | Student: ${studentName || studentEmail}`;
  const previewText = `Nahlášena chyba (${displayCategory}): ${(description || '').slice(0, 100)}...`;

  const safeDescription = (description || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');

  const bodyHtml = `
    <p style="margin-top:0;">Ahoj Nelo,</p>
    <p>student <strong>${studentName || 'Student'}</strong> (<code>${studentEmail}</code>) právě nahlásil chybu v aplikaci <strong>ProEdu</strong>.</p>

    <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #991B1B; margin-bottom: 6px;">
        Kategorie: ${displayCategory}
      </div>
      <div style="font-size: 15px; color: #1E1B18; line-height: 1.6;">
        ${safeDescription}
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td class="label">Odesílatel:</td>
        <td class="value"><strong>${studentName || 'Student'}</strong> (${studentEmail})</td>
      </tr>
      <tr>
        <td class="label">Stránka (URL):</td>
        <td class="value"><a href="${pageUrl}" style="color:#2563EB; word-break: break-all;">${pageUrl}</a></td>
      </tr>
      <tr>
        <td class="label">Zařízení / Prohlížeč:</td>
        <td class="value" style="font-size:12px; color:#475569;">${userAgent || 'Neuvedeno'}</td>
      </tr>
      <tr>
        <td class="label">Rozlišení obrazovky:</td>
        <td class="value">${screenResolution || 'Neuvedeno'}</td>
      </tr>
      ${reportId ? `
      <tr>
        <td class="label">ID hlášení:</td>
        <td class="value"><code>${reportId}</code></td>
      </tr>
      ` : ''}
    </table>

    ${screenshotUrl ? `
      <div style="margin: 24px 0; text-align: center;">
        <p style="font-weight: 700; color: #1E1B18; margin-bottom: 10px;">Přiložený snímek obrazovky:</p>
        <a href="${screenshotUrl}" target="_blank" style="display:inline-block; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; max-width: 100%;">
          <img src="${screenshotUrl}" alt="Screenshot chyby" style="max-width: 100%; max-height: 400px; display: block; margin: 0 auto;" />
        </a>
        <p style="margin-top: 6px; font-size: 12px;"><a href="${screenshotUrl}" target="_blank" style="color: #2563EB;">Otevřít obrázek v plné velikosti ↗</a></p>
      </div>
    ` : ''}

    <div style="text-align: center; margin: 28px 0 10px 0;">
      <a href="mailto:${studentEmail}?subject=Re:%20Va%C5%A1e%20hl%C3%A1%C5%A1en%C3%AD%20chyby%20v%20ProEdu" class="btn" style="background-color: #B80053;">
        Odpovědět studentovi na e-mail
      </a>
    </div>

    <p style="font-size: 12px; color: #64748B; text-align: center;">
      Nebo můžete hlášení spravovat přímo v <a href="${APP_URL}/teacher-dashboard?tab=bugReports" style="color: #2563EB;">Teacher Dashboardu</a>.
    </p>
  `;

  const html = renderEmailLayout({ previewText, headline, subheadline, bodyHtml });
  return sendEmail({
    to,
    replyTo: studentEmail,
    subject,
    html,
    logDetails: { reportId, studentEmail, category }
  });
}
