import { PDFDocument, rgb } from 'pdf-lib';
import { embedFonts } from './fonts.js';
import { toPdfSafeText } from './pdf-text.js';

/**
 * The certificate of completion records what was signed — and, because the
 * signing page shows an AI summary rather than only the contract, which
 * summary each signer was shown. The hash makes that claim checkable: re-hash
 * the stored summary and compare.
 */

export interface CertificateSigner {
  fullName: string;
  email: string;
  /** ISO timestamp. */
  signedAt: string;
  ip?: string;
  /** sha256 of the canonical JSON of the summary this signer was shown. */
  summaryHash?: string;
}

export interface CertificateFacts {
  documentName: string;
  /** sha256 of the signed document bytes. */
  documentHash: string;
  signers: CertificateSigner[];
  /** "checked against legislation as of …", when the document was reviewed. */
  lawVersionDate?: string;
}

/** `Summary shown to signer: sha256 …` — the line this track owns. */
export function summaryHashLine(summaryHash: string): string {
  return `Summary shown to signer: sha256 ${summaryHash}`;
}

export function documentHashLine(documentHash: string): string {
  return `Document: sha256 ${documentHash}`;
}

/** Plain lines, in order, for whatever renders the certificate. */
export function certificateLines(facts: CertificateFacts): string[] {
  const lines = [
    `Document name: ${facts.documentName}`,
    documentHashLine(facts.documentHash),
  ];

  for (const signer of facts.signers) {
    lines.push('', `Signer: ${signer.fullName} <${signer.email}>`);
    lines.push(`Signed at: ${signer.signedAt}`);
    if (signer.ip) lines.push(`From: ${signer.ip}`);
    lines.push(
      signer.summaryHash
        ? summaryHashLine(signer.summaryHash)
        : 'Summary shown to signer: none stored',
    );
  }

  if (facts.lawVersionDate) {
    lines.push(
      '',
      `AI review checked against legislation as of ${facts.lawVersionDate}`,
    );
  }

  return lines;
}

/* --------------------------------------------------------- certificate PDF -- */

/**
 * One person's copy is one certificate. The signed PDF shows WHAT was agreed;
 * this shows HOW we know who agreed and when: the signer as we knew them, how
 * they reached the link, every ceremony time, the network and browser, the
 * fingerprints of the original and the signed copy, and the server seal.
 *
 * Evidentiary claim: not "this human was identity-proofed", but "whoever held
 * this link (and the password, if set) opened it, was shown this document and
 * summary, agreed to sign electronically and produced this signature — and the
 * file has not changed since." Times are listed separately, never collapsed.
 */
export interface CertificatePdfSigner {
  /** The name typed when signing. */
  signerName: string;
  channel: 'email' | 'telegram' | 'sms' | 'link';
  contact: string | null;
  source: 'invite' | 'open_link';
  method: 'typed' | 'drawn' | 'uploaded';
  ip: string | null;
  userAgent: string | null;
  viewedAt: Date | null;
  consentAt: Date | null;
  signedAt: Date;
}

export interface CertificatePdfInput {
  requestId: string;
  recipientId: string;
  title: string;
  senderName: string;
  senderEmail: string;
  sentAt: Date | null;
  signer: CertificatePdfSigner;
  /** sha256 of the original PDF that was sent. */
  documentHash: string;
  /** sha256 of this person's signed copy. */
  signedHash: string;
  /** sha256 of the summary shown; null when none was shown. */
  summaryHash: string | null;
  /** base64 Ed25519 signature over the seal payload. */
  sealSignature: string;
  sealKid: string;
  /** "checked against legislation as of …", when the document was reviewed. */
  lawVersionDate?: string;
}

const MARGIN = 56;
const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const LABEL_W = 170;

const CHANNEL_LABEL: Record<CertificatePdfSigner['channel'], string> = {
  email: 'Elektron poçta',
  telegram: 'Telegram',
  sms: 'SMS',
  link: 'Havola',
};
const METHOD_LABEL: Record<CertificatePdfSigner['method'], string> = {
  typed: 'Yozilgan',
  drawn: 'Çizilgan',
  uploaded: 'Yuklangan rasm',
};

function fmt(d: Date | null): string {
  // An Invalid Date is truthy but toISOString() throws; treat it as missing.
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/** Break a long spaceless value (hash, base64 seal) across lines. */
function chunk(value: string, perLine: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += perLine) out.push(value.slice(i, i + perLine));
  return out.length > 0 ? out : ['—'];
}

export async function buildCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Imzolaş sertifikati — ${toPdfSafeText(input.title)}`);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const { regular: font, bold } = await embedFonts(pdf);

  const ink = rgb(0.067, 0.094, 0.153);
  const muted = rgb(0.38, 0.42, 0.48);
  const rule = rgb(0.86, 0.88, 0.9);

  let y = PAGE_H - MARGIN;

  /** Next block would not fit: new page, so the seal is never pushed off. */
  const ensure = (needed: number) => {
    if (y - needed >= MARGIN) return;
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const text = (
    value: string,
    opts: { size?: number; bold?: boolean; color?: typeof ink; x?: number } = {},
  ) => {
    page.drawText(toPdfSafeText(value), {
      x: opts.x ?? MARGIN,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? bold : font,
      color: opts.color ?? ink,
    });
  };

  /** Word-wrap `value` to `width` at `size`; a single over-long word is chunked. */
  const wrap = (value: string, size: number, width: number): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const word of toPdfSafeText(value).split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : ['—'];
  };

  const row = (label: string, value: string, size = 10) => {
    const lines = wrap(value || '—', size, PAGE_W - MARGIN * 2 - LABEL_W);
    const step = size + 4;
    ensure(step * lines.length + 4);
    text(label, { size: 9, color: muted });
    lines.forEach((line, i) => {
      text(line, { size, x: MARGIN + LABEL_W });
      if (i < lines.length - 1) y -= step;
    });
    y -= step + 4;
  };

  const section = (title: string) => {
    ensure(64); // heading + rule + a first row, never orphaned
    y -= 10;
    text(title, { size: 11, bold: true });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.75,
      color: rule,
    });
    y -= 16;
  };

  const block = (label: string, lines: string[]) => {
    ensure(14 + lines.length * 11);
    text(label, { size: 9, color: muted });
    y -= 14;
    for (const line of lines) {
      text(line, { size: 8 });
      y -= 11;
    }
    y -= 6;
  };

  text('LEX', { size: 13, bold: true });
  y -= 30;
  text('Imzolaş sertifikati', { size: 18, bold: true });
  y -= 20;
  text(`Yuboriş ${input.requestId} · nusxa ${input.recipientId}`, { size: 8, color: muted });
  y -= 24;

  const s = input.signer;
  section('Hujjat');
  row('Nomi', input.title);
  row('Yuboruvçi', `${input.senderName} <${input.senderEmail}>`);
  row('Yuborilgan', fmt(input.sentAt));

  section('Imzolovçi');
  row('Ism familiya', s.signerName);
  row('Kanal', s.contact ? `${CHANNEL_LABEL[s.channel]} · ${s.contact}` : CHANNEL_LABEL[s.channel]);
  row('Qanday kirgan', s.source === 'open_link' ? 'Oçiq havola orqali' : 'Şaxsiy havola orqali');
  row('IP manzil', s.ip ?? '—');
  row('Brauzer', s.userAgent ?? '—', 8);
  row('Birinçi oçilgan', fmt(s.viewedAt));
  row('Elektron imzolaşga rozilik', fmt(s.consentAt));
  row('Imzolangan', fmt(s.signedAt));
  row('Imzo usuli', METHOD_LABEL[s.method]);

  const original = chunk(input.documentHash, 64);
  const signed = chunk(input.signedHash, 64);
  const summary = input.summaryHash
    ? [summaryHashLine(input.summaryHash)]
    : ['Summary shown to signer: none stored'];
  const seal = chunk(input.sealSignature, 72);
  section('Özgarmaganlik dalili');
  // Keep the fingerprints and the seal on one page: this is the part a reader
  // is meant to be able to check by hand.
  ensure(4 * 20 + (original.length + signed.length + summary.length + seal.length) * 11);
  block('Asl hujjat (SHA-256)', original);
  block('Imzolangan nusxa (SHA-256)', signed);
  block('Körsatilgan AI xulosasi', summary);
  block(`Server muhri (Ed25519, kalit ${input.sealKid})`, seal);
  if (input.lawVersionDate) {
    row('AI tekşiruvi qonunçilik holati', input.lawVersionDate);
  }

  y -= 10;
  const explanation = [
    'Yuqoridagi SHA-256 — imzolangan nusxaning raqamli izi. Muhr — şu izning tizim kaliti bilan',
    'qöyilgan Ed25519 imzosi. Nusxani qayta xeşlab muhr bilan taqqoslaş fayl imzolangandan keyin',
    'özgarmaganini isbotlaydi. Imzolovçi hujjatni (va AI xulosasini) kördi, elektron imzolaşga',
    'rozilik berdi va yuqorida körsatilgan tarmoq va brauzerdan imzoladi.',
  ];
  for (const line of explanation) {
    ensure(11);
    text(line, { size: 8, color: muted });
    y -= 11;
  }

  return pdf.save();
}
