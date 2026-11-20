/**
 * Ten contracts for the clause splitter, written to look like what users
 * upload (layouts and numbering styles seen in Uzbek contracts, as text that
 * DOCX/PDF extraction produces). Names and numbers are made up.
 * Replace or extend with anonymised real contracts when the team has them.
 */
export interface ContractFixture {
  name: string;
  text: string;
  refs: string[];
  headings?: Record<string, string>;
}

export const CONTRACTS: ContractFixture[] = [
  {
    name: 'uz-latn rental, 1. / 1.1.',
    text: `TURAR JOY IJARASI SHARTNOMASI № 14

Toshkent shahri                                    2026-yil 1-mart

“Ijaraga beruvchi” A. Karimov va “Ijarachi” B. Rahimova quyidagilar haqida ushbu shartnomani tuzdilar:

1. Shartnoma predmeti
1.1. Ijaraga beruvchi Chilonzor tumani, 9-mavze, 12-uy, 34-xonadonni ijarachiga vaqtincha foydalanishga topshiradi.
1.2. Kvartira yashash uchun beriladi.
2. Ijara haqi va toʻlov tartibi
2.1. Oylik ijara haqi 4 500 000 (toʻrt million besh yuz ming) soʻmni tashkil etadi.
2.2. Ijara haqi har oyning 5-sanasigacha toʻlanadi.
3. Taraflarning majburiyatlari
3.1. Ijarachi kvartiradan maqsadiga muvofiq foydalanadi.
3.2. Ijaraga beruvchi kapital taʼmirlashni oʻz hisobidan amalga oshiradi.
4. Yakuniy qoidalar
4.1. Shartnoma 11 oy muddatga tuziladi.`,
    refs: ['preamble', '1', '1.1', '1.2', '2', '2.1', '2.2', '3', '3.1', '3.2', '4', '4.1'],
    headings: { '1': 'Shartnoma predmeti', '2': 'Ijara haqi va toʻlov tartibi', '4': 'Yakuniy qoidalar' },
  },
  {
    name: 'uz-latn employment, N-modda',
    text: `MEHNAT SHARTNOMASI

1-modda. Shartnoma predmeti
Xodim “Orzu Savdo” MChJda buxgalter lavozimida ishlaydi.

2-modda. Sinov muddati
Xodimga 3 (uch) oylik dastlabki sinov muddati belgilanadi.

3-modda. Ish vaqti
Haftalik ish vaqti 40 soatdan oshmaydi.

4-modda. Mehnatga haq toʻlash
Oylik ish haqi 6 000 000 soʻm, oyiga ikki marta toʻlanadi.

5-modda. Shartnomani bekor qilish
Shartnoma Mehnat kodeksida nazarda tutilgan asoslarda bekor qilinadi.`,
    refs: ['preamble', '1-modda', '2-modda', '3-modda', '4-modda', '5-modda'],
    headings: { '1-modda': 'Shartnoma predmeti', '5-modda': 'Shartnomani bekor qilish' },
  },
  {
    name: 'uz-cyrl services, sections + 1.1.',
    text: `ХИЗМАТ КЎРСАТИШ ШАРТНОМАСИ

1-боб. Умумий қоидалар
1.1. Ижрочи буюртмачига бухгалтерия хизматларини кўрсатади.
1.2. Хизматлар ҳар ойда кўрсатилади.

2-боб. Хизмат ҳақи
2.1. Хизмат ҳақи ойига 2 000 000 сўм.
2.2. Тўлов 10 кун ичида амалга оширилади.

3-боб. Жавобгарлик
3.1. Тўлов кечиктирилганда ҳар бир кун учун 0,1 фоиз пеня тўланади.`,
    refs: ['preamble', '1-боб', '1.1', '1.2', '2-боб', '2.1', '2.2', '3-боб', '3.1'],
    headings: { '1-боб': 'Умумий қоидалар', '3-боб': 'Жавобгарлик' },
  },
  {
    name: 'ru sale, Статья N',
    text: `ДОГОВОР КУПЛИ-ПРОДАЖИ № 7

г. Самарканд                                        10 февраля 2026 г.

Статья 1. Предмет договора
Продавец обязуется передать Покупателю товар — 20 ноутбуков.

Статья 2. Цена и порядок расчетов
Общая цена товара составляет 180 000 000 сум.
Оплата производится в течение 5 банковских дней.

Статья 3. Ответственность сторон
За просрочку поставки Продавец уплачивает пеню 0,5% за каждый день.

Статья 4. Разрешение споров
Споры рассматриваются в экономическом суде.`,
    refs: ['preamble', 'Статья 1', 'Статья 2', 'Статья 3', 'Статья 4'],
    headings: { 'Статья 1': 'Предмет договора', 'Статья 4': 'Разрешение споров' },
  },
  {
    name: 'ru NDA, sub-clauses only',
    text: `СОГЛАШЕНИЕ О НЕРАЗГЛАШЕНИИ

1.1 Получающая сторона обязуется не раскрывать конфиденциальную информацию.
1.2 Конфиденциальной информацией считаются сведения, помеченные грифом «Коммерческая тайна».
2.1 Обязательства действуют в течение 3 лет после окончания сотрудничества.
2.2 Информация возвращается по первому требованию.
3.1 За разглашение взыскивается штраф в размере 50 000 000 сум.`,
    refs: ['preamble', '1.1', '1.2', '2.1', '2.2', '3.1'],
  },
  {
    name: 'uz-latn loan, Roman sections with restarting numbers',
    text: `QARZ SHARTNOMASI

I. UMUMIY QOIDALAR
1. Qarz beruvchi qarz oluvchiga 30 000 000 soʻm qarz beradi.
2. Qarz foizsiz beriladi.

II. QAYTARISH TARTIBI
1. Qarz 2026-yil 31-dekabrgacha qaytariladi.
2. Qarz qismlarga boʻlib qaytarilishi mumkin.

III. JAVOBGARLIK
1. Qarz oʻz vaqtida qaytarilmasa, Fuqarolik kodeksining 327-moddasi qoʻllaniladi.`,
    refs: ['preamble', 'I', '1', '2', 'II', '1', '2', 'III', '1'],
    headings: { I: 'UMUMIY QOIDALAR', II: 'QAYTARISH TARTIBI' },
  },
  {
    name: 'uz-latn services, N-band',
    text: `XIZMAT KOʻRSATISH SHARTNOMASI

1-band. Ijrochi buyurtmachining veb-saytini ishlab chiqadi.
2-band. Ish 60 kun ichida bajariladi.
3-band. Xizmat haqi 25 000 000 soʻm, 50 foizi oldindan toʻlanadi.
4-band. Buyurtmachi ishni 5 ish kuni ichida qabul qiladi yoki asosli eʼtiroz bildiradi.`,
    refs: ['preamble', '1-band', '2-band', '3-band', '4-band'],
  },
  {
    name: 'short agreement, 1) only',
    text: `KELISHUV

1) Taraflar 2026-yil 1-apreldan hamkorlikni boshlaydilar.
2) Har bir taraf oʻz xarajatlarini oʻzi qoplaydi.
3) Kelishuv bir yil amal qiladi.`,
    refs: ['preamble', '1', '2', '3'],
  },
  {
    name: 'no numbering, paragraphs',
    text: `TILXAT

Men, Jasur Toʻlaganov, 2026-yil 5-martda Dilshod Umarovdan 5 000 000 soʻm qarz oldim.

Qarzni 2026-yil 5-iyungacha toʻliq qaytarishga majburman.

Imzo: ________`,
    refs: ['p1', 'p2', 'p3', 'p4'],
  },
  {
    name: 'uz-latn supply as PDF text: nested list, dates, amounts, 4.2), annex',
    text: `YETKAZIB BERISH SHARTNOMASI № 2026/15
Namangan shahri 2026-yil 20-yanvar
1. Shartnoma predmeti
Yetkazib beruvchi quyidagi tovarlarni yetkazib beradi:
1. Paxta yogʻi — 2 000 litr;
2. Kungaboqar yogʻi — 1 500 litr.
2. Narx
150 000 000 soʻm QQSni hisobga olgan holda.
3. Yetkazib berish muddati
20.02.2026 gacha omborga yetkaziladi.
4. Javobgarlik
4.1) Kechiktirilgan har bir kun uchun 0,5 foiz neustoyka toʻlanadi.
4.2) Neustoyka umumiy summaning 10 foizidan oshmaydi.
1-ilova. Tovarlar spetsifikatsiyasi
Paxta yogʻi, GOST 1128-75, 1 litrli idishlarda.`,
    refs: ['preamble', '1', '2', '3', '4', '4.1', '4.2', '1-ilova'],
    headings: { '3': 'Yetkazib berish muddati', '1-ilova': 'Tovarlar spetsifikatsiyasi' },
  },
];
