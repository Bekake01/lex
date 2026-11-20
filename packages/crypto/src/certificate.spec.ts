import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildCertificatePdf, type CertificatePdfInput } from './certificate.js';
import { toPdfSafeText } from './pdf-text.js';

const input: CertificatePdfInput = {
  requestId: '01999999-0000-7000-8000-000000000501',
  recipientId: '01999999-0000-7000-8000-000000000521',
  title: 'Turar joy ijarasi şartnomasi — Toşkent ş., Çilonzor tumani, 5-uy, 12-xonadon',
  senderName: 'Bekzod Kamolov',
  senderEmail: 'bekzod@example.uz',
  sentAt: new Date('2026-11-21T09:15:00Z'),
  signer: {
    signerName: 'Şoira Ğulomova Oʻktamovna',
    channel: 'telegram',
    contact: '@shoira_g',
    source: 'open_link',
    method: 'drawn',
    ip: '203.0.113.7',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    viewedAt: new Date('2026-11-21T09:20:00Z'),
    consentAt: new Date('2026-11-21T09:30:00Z'),
    signedAt: new Date('2026-11-21T09:31:00Z'),
  },
  documentHash: 'a'.repeat(64),
  signedHash: 'b'.repeat(64),
  summaryHash: 'c'.repeat(64),
  sealSignature: 'Zm9v'.repeat(22),
  sealKid: 'seal-2026-11',
};

describe('buildCertificatePdf', () => {
  it('renders an Uzbek certificate with Uzbek and Cyrillic names', async () => {
    const bytes = await buildCertificatePdf(input);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const cyr = await buildCertificatePdf({
      ...input,
      signer: { ...input.signer, signerName: 'Олим Ўғлонов' },
      summaryHash: null,
      sentAt: null,
    });
    expect(Buffer.from(cyr.subarray(0, 5)).toString()).toBe('%PDF-');
  });

  it('never throws on hostile text (emoji, CJK, control characters)', async () => {
    const bytes = await buildCertificatePdf({
      ...input,
      title: '日本語 😀\u0000\u0007 tab\there',
      signer: { ...input.signer, userAgent: '‮ evil \ud800' },
    });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
  });
});

describe('toPdfSafeText', () => {
  it('keeps Uzbek and Cyrillic letters, drops control characters', () => {
    expect(toPdfSafeText('Şoira Ğulomova Oʻktamovna')).toBe('Şoira Ğulomova Oʻktamovna');
    expect(toPdfSafeText('Ўғлонов')).toBe('Ўғлонов');
    expect(toPdfSafeText('a\u0000b\tc\nd')).toBe('ab c d');
  });
});
