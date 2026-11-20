import type { LawArticleHit } from '../law-search.types.js';

/**
 * Fixture articles for local development and the review eval harness.
 *
 * ⚠️ The texts are short paraphrases written to exercise the pipeline, not
 * authoritative law. Real article text, statuses and version dates come from
 * the law index (`src/law/`). Nothing here is ever shown to a user once the
 * law tables are loaded (`LAW_SEARCH_MODE` auto/db).
 */
export const FIXTURE_VERSION_DATE = '2026-06-01';

type Fixture = Omit<LawArticleHit, 'score'> & { keywords: string[] };

export const FIXTURE_ARTICLES: Fixture[] = [
  {
    articleId: 'fx-civil-a353',
    actTitle: "O'zbekiston Respublikasining Fuqarolik kodeksi",
    actType: 'code',
    articleNumber: '353',
    text: "Shartnoma tomonlarning fuqarolik huquqlari va burchlarini belgilash, o'zgartirish yoki bekor qilish haqidagi kelishuvidir. Tomonlar shartnoma shartlarini o'z xohishiga ko'ra belgilaydilar, qonun hujjatlarida belgilangan majburiy qoidalar bundan mustasno.",
    sourceUrl: 'https://lex.uz/docs/111181',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: ['shartnoma', 'kelishuv', 'shart', 'erkinlik', 'tomonlar'],
  },
  {
    articleId: 'fx-civil-a382',
    actTitle: "O'zbekiston Respublikasining Fuqarolik kodeksi",
    actType: 'code',
    articleNumber: '382',
    text: "Shartnoma bir tomonning talabi bilan faqat qonunda yoki shartnomada belgilangan hollarda o'zgartirilishi yoki bekor qilinishi mumkin. Bir tomonlama asossiz bekor qilish huquqini beruvchi shart ikkinchi tomon uchun nomutanosib ravishda og'ir hisoblanadi.",
    sourceUrl: 'https://lex.uz/docs/111181',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: [
      'bekor qilish',
      'o‘zgartirish',
      'bir tomonlama',
      'muddatidan oldin',
    ],
  },
  {
    articleId: 'fx-civil-a535',
    actTitle: "O'zbekiston Respublikasining Fuqarolik kodeksi",
    actType: 'code',
    articleNumber: '535',
    text: "Ijara shartnomasi bo'yicha ijaraga beruvchi mol-mulkni ijaraga oluvchiga haq to'lash asosida vaqtincha egalik qilish va foydalanishga topshiradi. Ijara haqi miqdori va to'lash tartibi shartnomada ko'rsatiladi.",
    sourceUrl: 'https://lex.uz/docs/111181',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: ['ijara', 'ijara haqi', 'mol-mulk', 'foydalanish', 'turar joy'],
  },
  {
    articleId: 'fx-civil-a556',
    actTitle: "O'zbekiston Respublikasining Fuqarolik kodeksi",
    actType: 'code',
    articleNumber: '556',
    text: "Ijaraga oluvchi mol-mulkni shartnomada belgilangan maqsadda ishlatishi va uni saqlashi shart. Ijara haqini bir tomonlama oshirish faqat shartnomada aniq tartib belgilangan bo'lsa mumkin.",
    sourceUrl: 'https://lex.uz/docs/111181',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: ['ijara haqi', 'oshirish', 'depozit', 'garov', 'saqlash'],
  },
  {
    articleId: 'fx-labor-a72',
    actTitle: "O'zbekiston Respublikasining Mehnat kodeksi",
    actType: 'code',
    articleNumber: '72',
    text: "Mehnat shartnomasi yozma shaklda tuziladi va unda ish joyi, lavozim, mehnatga haq to'lash shartlari, ish vaqti va dam olish vaqti ko'rsatiladi. Xodim ahvolini qonunga nisbatan yomonlashtiruvchi shartlar haqiqiy emas.",
    sourceUrl: 'https://lex.uz/docs/6257288',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: [
      'mehnat shartnomasi',
      'lavozim',
      'ish haqi',
      'xodim',
      'ish beruvchi',
    ],
  },
  {
    articleId: 'fx-labor-a95',
    actTitle: "O'zbekiston Respublikasining Mehnat kodeksi",
    actType: 'code',
    articleNumber: '95',
    text: "Ish beruvchi mehnat shartnomasini faqat qonunda sanab o'tilgan asoslar bo'yicha bekor qilishi mumkin va xodimni yozma ravishda oldindan ogohlantirishi shart. Sinov muddati olti oydan oshmaydi.",
    sourceUrl: 'https://lex.uz/docs/6257288',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: [
      'bekor qilish',
      'ishdan bo‘shatish',
      'ogohlantirish',
      'sinov muddati',
    ],
  },
  {
    articleId: 'fx-labor-a160',
    actTitle: "O'zbekiston Respublikasining Mehnat kodeksi",
    actType: 'code',
    articleNumber: '160',
    text: "Ish haqi kamida har oyda bir marta, shartnomada belgilangan muddatda to'lanadi. Ish haqini to'lashni kechiktirish uchun ish beruvchi javobgar bo'ladi.",
    sourceUrl: 'https://lex.uz/docs/6257288',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: ['ish haqi', 'to‘lov', 'muddat', 'kechiktirish', 'jarima'],
  },
  {
    articleId: 'fx-consumer-a11',
    actTitle:
      "Iste'molchilarning huquqlarini himoya qilish to'g'risidagi qonun",
    actType: 'law',
    articleNumber: '11',
    text: "Iste'molchining qonun bilan berilgan huquqlarini cheklovchi shartnoma shartlari haqiqiy emas. Xizmat ko'rsatuvchi tomon o'z javobgarligini shartnoma bilan to'liq chiqarib tashlay olmaydi.",
    sourceUrl: 'https://lex.uz/docs/27178',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: [
      'iste‘molchi',
      'javobgarlik',
      'cheklash',
      'xizmat',
      'haqiqiy emas',
    ],
  },
  {
    articleId: 'fx-secret-a7',
    actTitle: "Tijorat siri to'g'risidagi qonun",
    actType: 'law',
    articleNumber: '7',
    text: "Tijorat sirini saqlash majburiyati shartnomada aniq belgilangan ma'lumotlar doirasi va muddat bilan cheklanadi. Muddati cheklanmagan va predmeti aniqlanmagan maxfiylik majburiyati nomutanosib hisoblanadi.",
    sourceUrl: 'https://lex.uz/docs/61844',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: [
      'maxfiylik',
      'tijorat siri',
      'muddat',
      'oshkor qilmaslik',
      'nda',
    ],
  },
  {
    articleId: 'fx-civil-a386',
    actTitle: "O'zbekiston Respublikasining Fuqarolik kodeksi",
    actType: 'code',
    articleNumber: '386',
    text: 'Majburiyatni bajarmaganlik uchun penya miqdori shartnomada belgilanadi. Aniq nomutanosib yuqori penya sud tomonidan kamaytirilishi mumkin.',
    sourceUrl: 'https://lex.uz/docs/111181',
    versionDate: FIXTURE_VERSION_DATE,
    core: true,
    keywords: ['penya', 'jarima', 'neustoyka', 'javobgarlik', 'kechiktirish'],
  },
];

/** Acts always included for a document type, like A's anchor sets. */
export const FIXTURE_ANCHORS: Record<string, string[]> = {
  rental: ['fx-civil-a535', 'fx-civil-a556', 'fx-civil-a353'],
  employment: ['fx-labor-a72', 'fx-labor-a95', 'fx-labor-a160'],
  sale: ['fx-civil-a353', 'fx-civil-a386'],
  services: ['fx-civil-a353', 'fx-consumer-a11', 'fx-civil-a386'],
  nda: ['fx-secret-a7', 'fx-civil-a353'],
  other: ['fx-civil-a353'],
};
