import { toNewAlphabet } from './alphabet';

// Demo answers for the general legal Q&A chat (/ask) until apps/api has a real endpoint.
// Picked by keyword. Article numbers / links are sample content — verify before any demo. Not legal advice.

export type Citation = { law: string; article: string; url: string };

export type ContactKind = 'police' | 'medical' | 'court' | 'lawyer' | 'gov';

export type LegalAnswer = {
  id: string;
  match: RegExp;
  topic: string;
  urgent?: { text: string; numbers: { label: string; number: string }[] };
  summary: string;
  consequences?: { title: string; text: string; citation: Citation }[];
  steps?: string[];
  contacts?: { kind: ContactKind; name: string; detail: string; phone?: string }[];
  template?: { title: string; text: string };
  followUps: string[];
};

const JK = 'https://lex.uz/docs/111457';
const MJTK = 'https://lex.uz/docs/97661';
const FK = 'https://lex.uz/docs/180552';
const MK = 'https://lex.uz/';

export const answers: LegalAnswer[] = [
  {
    id: 'statement',
    match: /ariza|şikoyat yoz|qanday yoz/i,
    topic: 'Ariza namunasi',
    summary:
      'Arizani içki işlar bölimiga (IIB) yozma yoki oğzaki berişingiz mumkin. Navbatçi qismda ariza qabul qilinişi va sizga röyxatga olinganlik haqida talon berilişi şart. Quyida namuna — öz maʼlumotlaringiz bilan töldiring.',
    template: {
      title: 'IIB boşliğiga ariza',
      text: `________ tumani IIB boşliğiga
fuqaro ________________ (F.I.Ş.)
manzil: ________________, tel: ________

ARIZA

20__-yil __-________ kuni soat __:__ da ________________ (joy) da
fuqaro ________________ (maʼlum bölsa, F.I.Ş. yoki taşqi körinişi)
menga jismoniy zarar yetkazdi: ________________ (nima bölganini qisqa yozing).

Hodisa guvohlari: ________________ (ism, telefon).
Tibbiy yordam ________ şifoxonasida körsatildi.

Sizdan uşbu holat yuzasidan tekşiruv ötkazişingizni, meni sud-tibbiy
ekspertizaga yöllaşingizni va aybdorni qonunga muvofiq javobgarlikka
tortişingizni sörayman.

Sana: ________          Imzo: ________`,
    },
    steps: [
      'Arizani 2 nusxada tayyorlang — bittasiga qabul qilingani haqida belgi qöydirib oling',
      'Tibbiy maʼlumotnoma va suratlarning nusxasini ilova qiling',
      'Ariza röyxatga olingan raqam va talonni saqlang',
    ],
    followUps: ['Maʼnaviy zararni undirsa böladimi?'],
  },
  {
    id: 'moral-damage',
    match: /maʼ?naviy|zarar(ni)? (undir|qopla)|kompensats|davolaniş xarajat/i,
    topic: 'Zararni undiriş',
    summary:
      'Ha. Soğliğingizga yetkazilgan moddiy zarar (davolaniş, dori, işlay olmagan kunlar) va maʼnaviy zarar aybdordan undirilişi mumkin. Buni jinoyat işi doirasida fuqaroviy daʼvo sifatida yoki alohida fuqarolik sudiga daʼvo bilan talab qilasiz.',
    consequences: [
      {
        title: 'Moddiy zarar',
        text: 'Boşqa şaxsga zarar yetkazgan şaxs uni töliq qoplaşi şart.',
        citation: { law: 'Fuqarolik kodeksi', article: '985-modda', url: FK },
      },
      {
        title: 'Maʼnaviy zarar',
        text: 'Jismoniy yoki ruhiy azob uçun pul kompensatsiyasi sud tomonidan belgilanadi.',
        citation: { law: 'Fuqarolik kodeksi', article: '1021-modda', url: FK },
      },
    ],
    steps: [
      'Barça çek va kvitansiyalarni saqlang (dori, tahlil, transport)',
      'Işlay olmagan kunlar haqida iş joyidan maʼlumotnoma oling',
      'Jinoyat işi oçilgan bölsa, tergovçiga fuqaroviy daʼvogar deb tan oliş haqida ariza bering',
    ],
    contacts: [
      { kind: 'court', name: 'Fuqarolik işlari böyiça tuman sudi', detail: 'Alohida daʼvo uçun' },
      { kind: 'lawyer', name: 'Advokat', detail: 'Daʼvo summasini hisoblaş va sudda vakillik' },
    ],
    followUps: ['Ariza qanday yoziladi?'],
  },
  {
    id: 'assault',
    match: /\bur(di|ib|işdi|gan|moq)|kaltak|döpposlo|jarohat|şikast|muştl|tepdi|hujum qil/i,
    topic: 'Jismoniy zarar yetkaziş',
    urgent: {
      text: 'Agar jabrlanuvçi oğir ahvolda bölsa yoki xavf davom etayotgan bölsa — darhol qönğiroq qiling.',
      numbers: [
        { label: 'Tez yordam', number: '103' },
        { label: 'Politsiya', number: '102' },
      ],
    },
    summary:
      'Birovni qasddan uriş — huquqbuzarlik. Javobgarlik turi şikast qançalik oğirligiga boğliq: yengil holatda maʼmuriy jarima, oğirroq holatda jinoiy javobgarlik. Oğirlik darajasini faqat sud-tibbiy ekspertiza belgilaydi, şuning uçun ekspertizadan ötiş eng muhim qadam.',
    consequences: [
      {
        title: 'Soğliqqa zarar yetmagan yengil şikast',
        text: 'Maʼmuriy javobgarlik — jarima yoki maʼmuriy qamoq.',
        citation: { law: 'Maʼmuriy javobgarlik töğrisidagi kodeks', article: '52-modda', url: MJTK },
      },
      {
        title: 'Qasddan badanga yengil şikast',
        text: 'Soğliq qisqa muddatga buzilgan bölsa — jinoiy javobgarlik.',
        citation: { law: 'Jinoyat kodeksi', article: '109-modda', url: JK },
      },
      {
        title: 'Örtaça oğir yoki oğir şikast',
        text: 'Uzoq muddatli soğliq buzilişi, mehnat qobiliyatini yöqotiş — ozodlikdan mahrum qilişgaça.',
        citation: { law: 'Jinoyat kodeksi', article: '104–105-moddalar', url: JK },
      },
      {
        title: 'Jamoat joyida, bezorilik niyatida',
        text: 'Jamoat tartibini qöpol buziş bilan boğliq bölsa, alohida bezorilik moddasi qöllanadi.',
        citation: { law: 'Jinoyat kodeksi', article: '277-modda', url: JK },
      },
    ],
    steps: [
      'Xavfsiz joyga öting va tibbiy yordam oling — şifoxonadan körik haqida maʼlumotnoma sörang',
      'Şikastlarni sana bilan suratga oling; kiyim va boşqa dalillarni yuvmang, taşlamang',
      'Guvohlarning ismi va telefonini yozib oling; atrofdagi kameralar (dökon, bank, köça) yozuvini tezda sörang — ular bir neça kunda öçib ketadi',
      'Içki işlar bölimiga (IIB) ariza bering — ular sud-tibbiy ekspertizaga yöllanma beradi',
      'Ekspertiza xulosasidan keyin iş maʼmuriy yoki jinoiy tartibda köriladi; advokat bilan maslahatlaşing',
      'Davolaniş xarajatlari va maʼnaviy zararni aybdordan undirişingiz mumkin',
    ],
    contacts: [
      { kind: 'police', name: 'Politsiya', detail: 'Hodisa joyiga çaqiriş', phone: '102' },
      { kind: 'medical', name: 'Tez tibbiy yordam', detail: 'Şikastlar bölsa darhol', phone: '103' },
      { kind: 'police', name: 'Tuman Içki işlar bölimi (IIB)', detail: 'Yozma ariza beriş, navbatçi qism 24/7' },
      { kind: 'medical', name: 'Sud-tibbiy ekspertiza byurosi', detail: 'IIB yöllanmasi bilan, şikast darajasini aniqlaydi' },
      { kind: 'lawyer', name: 'Advokat', detail: 'Jabrlanuvçi sifatida huquqlaringizni himoya qiladi' },
      { kind: 'gov', name: 'Tuman adliya bölimi', detail: 'Bepul yuridik maslahat' },
    ],
    followUps: ['Ariza qanday yoziladi?', 'Maʼnaviy zararni undirsa böladimi?'],
  },
  {
    id: 'labor',
    match: /maoş|iş haqi|oylik|işdan (böşat|haydad|çiqar)|iş beruvçi|mehnat/i,
    topic: 'Mehnat huquqi',
    summary:
      'Iş beruvçi iş haqini öz vaqtida va töliq tölaşi, işdan böşatişni esa faqat qonunda körsatilgan asoslar va tartibda amalga oşirişi şart. Avval yozma talab qiling — bu keyingi bosqiçlarda dalil böladi.',
    consequences: [
      {
        title: 'Iş haqini keçiktiriş',
        text: 'Iş beruvçi qarzni tölaşi va keçiktirilgan har kun uçun kompensatsiya berişi lozim.',
        citation: { law: 'Mehnat kodeksi', article: 'iş haqi tölaş bölimi', url: MK },
      },
      {
        title: 'Noqonuniy böşatiş',
        text: 'Sud işga tiklaş va majburiy progul vaqti uçun haq tölaşni belgilaşi mumkin.',
        citation: { law: 'Mehnat kodeksi', article: 'mehnat nizolari bölimi', url: MK },
      },
    ],
    steps: [
      'Mehnat şartnomasi, buyruq, bank köçirmasi va yozişmalarni saqlang',
      'Iş beruvçiga yozma talabnoma bering (nusxasiga qabul belgisini oling)',
      'Javob bölmasa — Davlat mehnat inspeksiyasiga şikoyat qiling',
      'Böşatişga qarşi sudga murojaat muddati qisqa — keçiktirmang',
    ],
    contacts: [
      { kind: 'gov', name: 'Davlat mehnat inspeksiyasi', detail: 'Bepul tekşiruv, iş beruvçiga körsatma beradi' },
      { kind: 'gov', name: 'Kasaba uyuşmasi', detail: 'Agar korxonada bölsa' },
      { kind: 'court', name: 'Fuqarolik işlari böyiça tuman sudi', detail: 'Mehnat nizolari böyiça davlat boji tölanmaydi' },
    ],
    followUps: [],
  },
];

export const fallbackAnswer: LegalAnswer = {
  id: 'fallback',
  match: /$^/,
  topic: 'Umumiy savol',
  summary:
    'Vaziyatni töğri baholaş uçun biroz köproq maʼlumot kerak: nima böldi, qaçon va qayerda, kimlar iştirok etdi, qanday hujjatlar bor? Şunda tegişli qonun moddalari va qayerga murojaat qiliş kerakligini aniq aytaman.',
  contacts: [
    { kind: 'police', name: 'Politsiya', detail: 'Hayot yoki mulkka xavf bölsa', phone: '102' },
    { kind: 'gov', name: 'Tuman adliya bölimi', detail: 'Bepul yuridik maslahat' },
    { kind: 'lawyer', name: 'Advokat', detail: 'Murakkab holatlar va sud uçun' },
  ],
  followUps: ['Meni kimdir urib ketdi, nima qilişim kerak?', 'Iş beruvçi maoşni bermayapti', 'Ijara şartnomasini tekşirib ber'],
};

export function answerFor(question: string): LegalAnswer {
  const q = toNewAlphabet(question);
  return answers.find((a) => a.match.test(q)) ?? fallbackAnswer;
}
