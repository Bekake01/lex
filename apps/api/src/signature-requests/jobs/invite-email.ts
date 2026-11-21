/** The signing invite email (Uzbek). Everything from users is escaped. */
export interface InviteEmailInput {
  senderName: string;
  recipientName: string | null;
  title: string;
  message: string | null;
  signUrl: string;
}

const escape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function inviteEmail(input: InviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { senderName, recipientName, title, message, signUrl } = input;
  const greeting = recipientName
    ? `Assalomu alaykum, ${recipientName}!`
    : 'Assalomu alaykum!';
  const lead = `${senderName} sizga «${title}» hujjatini imzolaş uçun yubordi.`;
  const note =
    'Havola faqat siz uçun — uni boşqalarga ulaşmang. Imzolaşdan oldin hujjatning qisqa xulosasini körasiz.';
  const footer =
    'Bu xat Cralex orqali yuborildi. Unga javob yozmang — bu manzil xatlarni qabul qilmaydi.';

  const subject = `${senderName} sizga imzolaş uçun hujjat yubordi: ${title}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <tr><td>
      <p style="margin:0 0 24px;font-size:20px;font-weight:700">Cralex</p>
      <p style="margin:0 0 12px;font-size:16px">${escape(greeting)}</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escape(lead)}</p>
      ${
        message
          ? `<p style="margin:0 0 16px;padding:12px 16px;background:#f5f5f4;border-radius:8px;font-size:15px;line-height:1.5;white-space:pre-line">${escape(message)}</p>`
          : ''
      }
      <p style="margin:24px 0"><a href="${escape(signUrl)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:600">Hujjatni oçiş</a></p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#57534e">${escape(note)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#78716c">Tugma işlamasa, bu havolani brauzerda oçing:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${escape(signUrl)}" style="color:#1c1917">${escape(signUrl)}</a></p>
      <p style="margin:0;font-size:12px;color:#a8a29e">${escape(footer)}</p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    greeting,
    '',
    lead,
    ...(message ? ['', message] : []),
    '',
    `Hujjatni oçiş: ${signUrl}`,
    '',
    note,
    '',
    footer,
  ].join('\n');

  return { subject, html, text };
}
