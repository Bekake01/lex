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
