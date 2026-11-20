export type Script = 'latn' | 'cyrl' | 'mixed' | 'none';

export interface ScriptStats {
  script: Script;
  /** Share of letters that are Cyrillic, 0..1. */
  cyrillic: number;
  /** Share of letters that are Latin, 0..1. */
  latin: number;
}

/** A text counts as one script when at least this share of its letters use it. */
const DOMINANT = 0.8;

/** Detects whether a text is Latin, Cyrillic or a mix, by counting letters. */
export function detectScript(text: string): ScriptStats {
  const cyr = text.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  const lat = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const total = cyr + lat;
  if (total === 0) return { script: 'none', cyrillic: 0, latin: 0 };

  const cyrillic = cyr / total;
  const latin = lat / total;
  const script: Script =
    cyrillic >= DOMINANT ? 'cyrl' : latin >= DOMINANT ? 'latn' : 'mixed';
  return { script, cyrillic, latin };
}
