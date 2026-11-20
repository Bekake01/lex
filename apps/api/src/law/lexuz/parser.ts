import * as cheerio from 'cheerio';
import type { ActType } from '../law.types.js';
import { normalizeUz } from '../text/index.js';

/**
 * Reads a lex.uz document page (law plan, Phase 9). The page marks every
 * element of the act with a class:
 * - ACT_FORM ("Oʻzbekiston Respublikasining Qonuni"), ACT_TITLE
 * - TEXT_HEADER_DEFAULT: parts ("UMUMIY QISM"), chapters ("I BOB. …", "1-bob. …"), sections ("1-§. …")
 * - CLAUSE_DEFAULT: an article heading ("7-modda. Ijara haqi")
 * - ACT_TEXT (and ACT_ESSENTIAL_ELEMENTS…): body paragraphs
 * Each element's text is in its child `div[id]`; the sibling `.lx_elem2` is a
 * toolbar ("Hujjatga taklif yuborish…") and is ignored, as are editorial
 * comments, amendment notes and classifier codes (`.lx_no_select`).
 */
export interface ParsedArticle {
  number: string | null;
  title: string | null;
  part: string | null;
  chapter: string | null;
  text: string;
}

export interface ParsedAct {
  title: string;
  actType: ActType;
  docNumber: string | null;
  docDate: string | null;
  effectiveDate: string | null;
  /** Newest edition date on the page; the text is that edition. */
  versionDate: string | null;
  status: 'in_force' | 'repealed';
  repealedOn: string | null;
  articles: ParsedArticle[];
}

const DATE = /(\d{2})\.(\d{2})\.(\d{4})/;
const iso = (d: string | undefined | null): string | null => {
  const m = d ? DATE.exec(d) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const clean = (s: string) => normalizeUz(s.replace(/\s+/g, ' ')).trim();

const BODY = new Set(['ACT_TEXT', 'ACT_ESSENTIAL_ELEMENTS', 'ACT_ESSENTIAL_ELEMENTS_NUM']);

function actTypeOf(form: string, title: string): ActType {
  const s = `${form} ${title}`.toLowerCase();
  if (s.includes('konstitutsiya')) return 'constitution';
  if (s.includes('kodeks')) return 'code';
  if (s.includes('qonun')) return 'law';
  if (s.includes('farmon')) return 'decree';
  if (s.includes('qaror')) return 'resolution';
  if (s.includes('buyruq') || s.includes('buyrugʻ') || s.includes('farmoyish')) return 'order';
  return 'other';
}

/** "7-modda. Ijara haqi" → { number: "7", title: "Ijara haqi" } (also "7¹-modda", "12-1-modda"). */
function articleHeading(heading: string): { number: string | null; title: string | null } {
  const m = /^(\d+(?:[-–]\d+)?[¹²³⁴⁵⁶⁷⁸⁹⁰]*)\s*-?\s*modda\.?\s*(.*)$/i.exec(heading);
  if (!m) return { number: null, title: heading || null };
  return { number: m[1].replace('–', '-'), title: m[2].trim() || null };
}

export function parseLexUzAct(html: string): ParsedAct {
  const $ = cheerio.load(html);
  const elementText = (el: Parameters<typeof $>[0]) => clean($(el).children('div[id]').text());

  const form = clean($('#divCont .ACT_FORM').first().children('div[id]').text());
  const title = clean($('#divCont .ACT_TITLE').first().children('div[id]').text()) || clean($('title').text());

  // Header: "Oʻzbekiston Respublikasining Qonuni, 11.09.2014 yildagi O‘RQ-374-son", "Kuchga kirish sanasi 12.09.2014".
  const header = $('.docHeader__item')
    .map((_, e) => $(e).text().replace(/\s+/g, ' ').trim())
    .get()
    .join(' | ');
  const issued = /(\d{2}\.\d{2}\.\d{4})\s*yildagi\s*([^\s|]*?)-?son/.exec(header);
  const effective = /Kuchga kirish sanasi\s*(\d{2}\.\d{2}\.\d{4})/.exec(header);

  const pageText = $('body').text().replace(/\s+/g, ' ');
  const repealed = /Hujjat kuchini yo.qotgan\s*(\d{2}\.\d{2}\.\d{4})?/.exec(pageText);

  // Edition dates: the edition dropdown and the "previous edition" links carry ONDATE=dd.mm.yyyy.
  const editions = [...html.matchAll(/ONDATE=(\d{2}\.\d{2}\.\d{4})/g)].map((m) => iso(m[1])!).filter(Boolean);
  const latestEdition = editions.sort().at(-1) ?? null;

  const articles: ParsedArticle[] = [];
  let part: string | null = null;
  let chapter: string | null = null;
  let current: ParsedArticle | null = null;
  const preamble: string[] = [];

  $('#divCont .lx_elem').each((_, el) => {
    const kind = ($(el).attr('class') ?? '').split(/\s+/).find((c) => c !== 'lx_elem') ?? '';
    const text = elementText(el);
    if (!text) return;
    if (kind === 'TEXT_HEADER_DEFAULT') {
      if (/qism|boʻlim|bo.lim|razdel|часть/i.test(text) && !/bob|§/i.test(text)) {
        part = text;
        chapter = null;
      } else {
        chapter = text;
      }
    } else if (kind === 'CLAUSE_DEFAULT') {
      current = { ...articleHeading(text), part, chapter, text: '' };
      articles.push(current);
    } else if (BODY.has(kind)) {
      if (current) current.text = current.text ? `${current.text}\n${text}` : text;
      else preamble.push(text);
    }
  });

  // Acts without articles (most decrees and resolutions): one flat article.
  if (articles.length === 0 && preamble.length > 0) {
    articles.push({ number: null, title: null, part: null, chapter: null, text: preamble.join('\n') });
  }

  return {
    title,
    actType: actTypeOf(form, title),
    docNumber: issued?.[2] ? issued[2].replace(/-$/, '') || null : null,
    docDate: iso(issued?.[1]),
    effectiveDate: iso(effective?.[1]),
    versionDate: latestEdition ?? iso(effective?.[1]) ?? iso(issued?.[1]),
    status: repealed ? 'repealed' : 'in_force',
    repealedOn: iso(repealed?.[1]),
    articles: articles.filter((a) => a.text.trim().length > 0 || a.title),
  };
}
