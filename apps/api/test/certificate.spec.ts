import { certificateLines, hashJson, summaryHashLine } from '@lex/crypto';
import { describe, expect, it } from 'vitest';

/**
 * The certificate has to be able to prove which summary a signer was shown.
 * That claim is only worth something if the hash is reproducible from the
 * stored summary, which is what these tests pin down.
 */
describe('certificate', () => {
  const body = {
    overview: 'Bu ijara shartnomasi.',
    yourObligations: [{ text: "Ijara haqini to'lash", clauseRef: '2' }],
    otherObligations: [],
    keyConditions: [{ label: 'Muddat', value: '1 yil' }],
  };

  it('writes the summary line the signing track owns', () => {
    const hash = hashJson(body);
    expect(summaryHashLine(hash)).toBe(
      `Summary shown to signer: sha256 ${hash}`,
    );
  });

  it('includes a line per signer, with the document and summary hashes', () => {
    const lines = certificateLines({
      documentName: 'ijara-shartnomasi.docx',
      documentHash: 'a'.repeat(64),
      lawVersionDate: '2026-06-01',
      signers: [
        {
          fullName: 'Dilnoza Yusupova',
          email: 'signer@example.com',
          signedAt: '2026-11-20T10:00:00.000Z',
          summaryHash: hashJson(body),
        },
      ],
    });

    expect(lines).toContain(`Document: sha256 ${'a'.repeat(64)}`);
    expect(lines).toContain(summaryHashLine(hashJson(body)));
    expect(lines).toContain(
      'AI review checked against legislation as of 2026-06-01',
    );
  });

  it('says so plainly when no summary was stored', () => {
    const lines = certificateLines({
      documentName: 'x.docx',
      documentHash: 'b'.repeat(64),
      signers: [
        {
          fullName: 'A',
          email: 'a@example.com',
          signedAt: '2026-11-20T10:00:00.000Z',
        },
      ],
    });
    expect(lines).toContain('Summary shown to signer: none stored');
  });

  it('hashes the same summary to the same digest whatever the key order', () => {
    const reordered = {
      keyConditions: body.keyConditions,
      otherObligations: body.otherObligations,
      yourObligations: body.yourObligations,
      overview: body.overview,
    };
    expect(hashJson(reordered)).toBe(hashJson(body));
  });
});
