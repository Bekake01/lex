import type { DocType } from '../law.types.js';

/**
 * The hand-picked core acts (law plan, Phase 9): imported straight from
 * lex.uz in their current edition, marked `core`, and used as **anchors**:
 * a search for a contract of type X always considers the anchor acts of X.
 *
 * `docId` is the lex.uz uz-Latin document id (negative; the page is
 * https://lex.uz/uz/docs/{docId}). Ids were taken from the Hugging Face
 * corpus and lex.uz. To add an act: append it here, then run `pnpm ingest:core`.
 */
export interface CoreAct {
  docId: string;
  name: string;
  /** Contract types this act anchors. Empty: core (current edition) but no anchor. */
  anchors: DocType[];
}

export const CORE_ACTS: CoreAct[] = [
  { docId: '-111189', name: 'Fuqarolik kodeksi (1-qism: umumiy qoidalar, shartnomalar)', anchors: ['rental', 'sale', 'services', 'nda', 'employment', 'other'] },
  { docId: '-180552', name: 'Fuqarolik kodeksi (2-qism: shartnoma turlari)', anchors: ['rental', 'sale', 'services', 'other'] },
  { docId: '-6257288', name: 'Mehnat kodeksi (2022)', anchors: ['employment'] },
  { docId: '-112328', name: 'Ijara toʻgʻrisida', anchors: ['rental'] },
  { docId: '-106136', name: 'Uy-joy kodeksi', anchors: ['rental'] },
  { docId: '-4704', name: 'Isteʼmolchilarning huquqlarini himoya qilish toʻgʻrisida', anchors: ['sale', 'services'] },
  { docId: '-6213382', name: 'Elektron tijorat toʻgʻrisida', anchors: ['sale'] },
  { docId: '-18942', name: 'Xoʻjalik yurituvchi subyektlar faoliyatining shartnomaviy-huquqiy bazasi toʻgʻrisida', anchors: ['sale', 'services', 'other'] },
  { docId: '-2460801', name: 'Tijorat siri toʻgʻrisida', anchors: ['nda'] },
  { docId: '-4396419', name: 'Shaxsga doir maʼlumotlar toʻgʻrisida', anchors: ['rental', 'sale', 'services', 'nda', 'employment', 'other'] }, // Phase 10: almost every contract handles personal data
  { docId: '-6445145', name: 'Konstitutsiya (2023)', anchors: [] },
  { docId: '-4674902', name: 'Soliq kodeksi', anchors: [] },
  { docId: '-104720', name: 'Oila kodeksi', anchors: [] },
  { docId: '-6052631', name: 'Reklama toʻgʻrisida', anchors: [] },
  { docId: '-2055680', name: 'Xususiy mulkni himoya qilish va mulkdorlar huquqlarining kafolatlari toʻgʻrisida', anchors: [] },
  // Repealed acts that the corpus still lists as in force: importing them
  // from lex.uz records their real status, so search stops returning them.
  { docId: '-142859', name: 'Mehnat kodeksi (1995, kuchini yoʻqotgan)', anchors: [] },
];

/** Anchor act ids for a contract type. */
export function anchorDocIds(docType: DocType | undefined): string[] {
  if (!docType) return [];
  return CORE_ACTS.filter((a) => a.anchors.includes(docType)).map((a) => a.docId);
}
