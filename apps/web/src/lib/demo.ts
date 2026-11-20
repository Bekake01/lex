// Demo content for the UI until apps/api has the real endpoints.
// Contracts arrive from the backend (sent to this user); the user reviews them with AI, then signs or asks for changes.
// Shapes follow ROADMAP §4.4 (ai_reviews, ai_issues, recipient_summaries) — swap for API data later.
// The legal text below is sample content, not legal advice.

export type Severity = 'high' | 'medium' | 'low';

export type Clause = { id: string; number: number; title: string; text: string };

export type Issue = {
  id: string;
  clauseId: string;
  severity: Severity;
  title: string;
  problem: string;
  recommendation: string;
  citation: { law: string; article: string; url: string };
  fix?: { replacement: string; reason: string };
};

// new = waiting for my signature; changes = I asked the sender for changes;
// waiting = I sent it, the other side has not signed yet; signed = done.
export type ContractStatus = 'new' | 'changes' | 'waiting' | 'signed';

export const severityMeta: Record<
  Severity,
  { label: string; dot: string; badge: string; doc: string; weight: number }
> = {
  high: {
    label: 'Yuqori',
    dot: 'bg-danger',
    badge: 'bg-danger-soft text-danger ring-danger-line',
    doc: 'bg-danger-soft border-danger/50',
    weight: 18,
  },
  medium: {
    label: 'Örta',
    dot: 'bg-warning',
    badge: 'bg-warning-soft text-warning ring-warning-line',
    doc: 'bg-warning-soft border-warning/50',
    weight: 10,
  },
  low: {
    label: 'Past',
    dot: 'bg-info',
    badge: 'bg-info-soft text-info ring-info-line',
    doc: 'bg-info-soft border-info/50',
    weight: 4,
  },
};

export const statusMeta: Record<ContractStatus, { label: string; className: string }> = {
  new: { label: 'Yangi', className: 'bg-accent-soft text-accent' },
  changes: { label: 'Özgartiriş söralgan', className: 'bg-warning-soft text-warning' },
  waiting: { label: 'Imzo kutilmoqda', className: 'bg-subtle text-muted' },
  signed: { label: 'Imzolangan', className: 'bg-success-soft text-success' },
};

export const contract = {
  id: 'demo',
  title: 'Turar joy ijarasi şartnomasi №12',
  type: 'Ijara şartnomasi',
  fileName: 'ijara_şartnomasi_12.pdf',
  sender: 'Karimov Akmal',
  receivedAt: '18-noyabr',
  pages: 4,
  city: 'Toşkent ş.',
  date: '2026-yil 18-noyabr',
  parties: [
    { id: 'landlord', role: 'Ijaraga beruvçi', name: 'Karimov Akmal Rustamoviç', isSender: true },
    { id: 'tenant', role: 'Ijaraçi', name: 'Yusupova Dilnoza Bahodirovna', isSender: false },
  ],
  clauses: [
    {
      id: 'c1',
      number: 1,
      title: 'Şartnoma predmeti',
      text: 'Ijaraga beruvçi Toşkent ş., Yunusobod tumani, 4-mavze, 12-uy, 45-xonadonda joylaşgan 2 xonali turar joyni (umumiy maydoni 54 kv.m) Ijaraçiga yaşaş uçun vaqtinça foydalanişga beradi.',
    },
    {
      id: 'c2',
      number: 2,
      title: 'Ijara muddati',
      text: 'Şartnoma 2026-yil 1-dekabrdan 2027-yil 31-oktabrgaça bölgan muddatga (11 oy) tuziladi.',
    },
    {
      id: 'c3',
      number: 3,
      title: 'Ijara haqi',
      text: 'Oylik ijara haqi 450 AQŞ dollari miqdorida belgilanadi va har oyning 5-sanasigaça naqd AQŞ dollarida tölanadi.',
    },
    {
      id: 'c4',
      number: 4,
      title: 'Garov puli',
      text: 'Ijaraçi şartnoma imzolangan kuni 450 AQŞ dollari miqdorida garov puli tölaydi. Garov puli heç qanday holatda Ijaraçiga qaytarilmaydi.',
    },
    {
      id: 'c5',
      number: 5,
      title: 'Şartnomani bekor qiliş',
      text: 'Ijaraga beruvçi şartnomani istalgan vaqtda, oldindan ogohlantirmasdan va sababini körsatmasdan bir tomonlama bekor qilişga haqli.',
    },
    {
      id: 'c6',
      number: 6,
      title: 'Javobgarlik',
      text: 'Ijara haqi keçiktirilganda Ijaraçi har bir keçiktirilgan kun uçun oylik ijara haqining 1 foizi miqdorida penya tölaydi.',
    },
    {
      id: 'c7',
      number: 7,
      title: 'Nizolarni hal qiliş',
      text: 'Tomonlar örtasidagi nizolar muzokaralar yöli bilan, kelişuvga erişilmaganda esa Özbekiston Respublikasi qonunçiligiga muvofiq sud tartibida hal qilinadi.',
    },
    {
      id: 'c8',
      number: 8,
      title: 'Yakuniy qoidalar',
      text: 'Şartnoma ikki nusxada tuziladi, har bir nusxa teng yuridik kuçga ega. Şartnoma tomonlar imzolagan paytdan kuçga kiradi.',
    },
  ] satisfies Clause[],
};

export const review = {
  score: 72,
  verdict:
    'Şartnoma asosan töğri tuzilgan, lekin 2 ta jiddiy muammo bor: tölov çet el valyutasida belgilangan va garov puli qaytarilmasligi Ijaraçi huquqlarini çeklaydi. Imzolaşdan oldin tuzatiş tavsiya etiladi.',
  lawVersionDate: '2026-yil 1-noyabr holatiga',
  articlesChecked: 38,
  issues: [
    {
      id: 'i1',
      clauseId: 'c3',
      severity: 'high',
      title: 'Tölov çet el valyutasida belgilangan',
      problem:
        'Rezidentlar örtasidagi hisob-kitoblar milliy valyutada amalga oşirilişi kerak. Ijara haqini AQŞ dollarida naqd tölaş talabi valyuta qonunçiligiga zid.',
      recommendation: 'Ijara haqini sömda belgilang yoki sömda tölanadigan ekvivalentni yozing.',
      citation: { law: 'Valyutani tartibga soliş töğrisidagi Qonun', article: '15-modda', url: 'https://lex.uz/' },
      fix: {
        replacement:
          'Oylik ijara haqi 5 600 000 (beş million olti yuz ming) söm miqdorida belgilanadi va har oyning 5-sanasigaça Ijaraga beruvçining bank hisob raqamiga ötkaziş yoki naqd sömda tölanadi.',
        reason: 'Tölov milliy valyutaga ötkazildi, bank orqali tölaş imkoniyati qöşildi.',
      },
    },
    {
      id: 'i2',
      clauseId: 'c4',
      severity: 'high',
      title: 'Garov puli heç qaçon qaytarilmaydi',
      problem:
        'Garov majburiyat bajarilişini taʼminlaş uçun xizmat qiladi. Majburiyat töliq bajarilganda ham garovni qaytarmaslik asossiz boyiş hisoblanadi va Ijaraçi uçun adolatsiz şart.',
      recommendation: 'Garov puli şartnoma tugaganda, zarar bölmasa, qaytarilişini belgilang.',
      citation: { law: 'Fuqarolik kodeksi', article: '1023-modda', url: 'https://lex.uz/docs/180552' },
      fix: {
        replacement:
          'Ijaraçi şartnoma imzolangan kuni 5 600 000 söm miqdorida garov puli tölaydi. Garov puli şartnoma muddati tugaganidan keyin 10 kun içida, turar joyga yetkazilgan zarar va tölanmagan qarzlar çegirilgan holda, Ijaraçiga qaytariladi.',
        reason: 'Garovni qaytariş muddati va çegiriş asoslari aniq belgilandi.',
      },
    },
    {
      id: 'i3',
      clauseId: 'c5',
      severity: 'medium',
      title: 'Bir tomonlama bekor qiliş huquqi',
      problem:
        'Faqat Ijaraga beruvçiga ogohlantirişsiz bekor qiliş huquqi berilgan. Turar joy ijarasida bekor qiliş asoslari va ogohlantiriş muddati qonun bilan tartibga solinadi.',
      recommendation: 'Ikkala tomon uçun ham kamida 1 oy oldin yozma ogohlantiriş şartini kiriting.',
      citation: { law: 'Fuqarolik kodeksi', article: '382-modda', url: 'https://lex.uz/docs/111189' },
      fix: {
        replacement:
          'Har bir tomon şartnomani muddatidan oldin bekor qiliş haqida ikkinçi tomonni kamida 1 (bir) oy oldin yozma ravişda ogohlantirgan holda bekor qilişga haqli.',
        reason: 'Bekor qiliş huquqi ikkala tomonga teng berildi, ogohlantiriş muddati qöşildi.',
      },
    },
    {
      id: 'i4',
      clauseId: 'c6',
      severity: 'medium',
      title: 'Penya miqdori çeklanmagan',
      problem:
        'Kuniga 1% penya yuqori çegarasiz belgilangan. Sud majburiyat buzilişi oqibatlariga nomutanosib penyani kamaytirişga haqli.',
      recommendation: 'Penyani kuniga 0,1–0,5% va umumiy miqdorini oylik haqning 50% bilan çeklang.',
      citation: { law: 'Fuqarolik kodeksi', article: '326-modda', url: 'https://lex.uz/docs/111189' },
      fix: {
        replacement:
          'Ijara haqi keçiktirilganda Ijaraçi har bir keçiktirilgan kun uçun tölanmagan summaning 0,3 foizi miqdorida penya tölaydi, biroq penyaning umumiy miqdori oylik ijara haqining 50 foizidan oşmasligi kerak.',
        reason: 'Penya stavkasi kamaytirildi va yuqori çegara qöyildi.',
      },
    },
    {
      id: 'i5',
      clauseId: 'c8',
      severity: 'low',
      title: 'Soliq organida hisobga qöyiş eslatilmagan',
      problem:
        'Jismoniy şaxslar örtasidagi turar joy ijarasi şartnomasi soliq organlarida hisobga qöyilişi lozim. Şartnomada bu majburiyat kimga yuklanişi körsatilmagan.',
      recommendation: 'Şartnomani hisobga qöyiş majburiyatini Ijaraga beruvçiga yuklang.',
      citation: { law: 'Soliq kodeksi', article: '—', url: 'https://lex.uz/' },
    },
  ] satisfies Issue[],
};

// Documents in a signing flow. `direction`: in = sent to me, out = I sent it.
// `sender` is the other party (the sender for `in`, the recipient for `out`).
export const contracts: {
  id: string;
  title: string;
  sender: string;
  direction: 'in' | 'out';
  status: ContractStatus;
  risk: Severity | null;
  received: string;
}[] = [
  { id: 'demo', title: 'Turar joy ijarasi şartnomasi №12', sender: 'Karimov Akmal', direction: 'in', status: 'new', risk: 'high', received: 'Bugun' },
  { id: 'emp-7', title: 'Mehnat şartnomasi — dasturçi', sender: '“Najot IT” MÇJ', direction: 'in', status: 'new', risk: 'low', received: 'Keça' },
  { id: 'svc-2', title: 'Xizmat körsatiş şartnomasi', sender: '“Bunyod Quriliş” MÇJ', direction: 'in', status: 'changes', risk: 'medium', received: '14-noy' },
  { id: 'nda-3', title: 'Maxfiylik kelişuvi (NDA)', sender: 'Rahimov Sardor', direction: 'in', status: 'signed', risk: 'low', received: '12-noy' },
  { id: 'sale-1', title: 'Avtomobil oldi-sotdi şartnomasi', sender: 'Toşmatov Bobur', direction: 'out', status: 'signed', risk: 'medium', received: '9-noy' },
  { id: 'out-1', title: 'Ofis ijarasi şartnomasi', sender: '“Grand Plaza” MÇJ', direction: 'out', status: 'waiting', risk: 'low', received: 'Bugun' },
  { id: 'out-2', title: 'Dizayn xizmatlari şartnomasi', sender: 'Yusupova Dilnoza', direction: 'out', status: 'waiting', risk: null, received: '16-noy' },
];

// The user's own uploaded files ("Hujjatlarim"). TODO: list from the API once it has GET /documents.
export const myDocuments: { id: string; name: string; size: string; added: string }[] = [
  { id: 'd1', name: 'ijara_şartnomasi_12.pdf', size: '240 KB', added: 'Bugun' },
  { id: 'd2', name: 'mehnat_şartnomasi.docx', size: '86 KB', added: 'Keça' },
  { id: 'd3', name: 'işonçnoma_namuna.docx', size: '34 KB', added: '15-noy' },
];

/** Recent Q&A chats for the sidebar (demo until the API stores chats). */
export const recentChats: { id: string; title: string; q: string; when: string }[] = [
  { id: 'c1', title: 'Urib ketişdi, nima qilay?', q: 'Meni kimdir urib ketdi, nima qilişim kerak?', when: 'Bugun' },
  { id: 'c2', title: 'Ikki oylik maoş berilmayapti', q: 'Ish beruvçi 2 oydan beri maoş bermayapti', when: 'Keça' },
  { id: 'c3', title: 'Maʼnaviy zarar qanday undiriladi', q: 'Maʼnaviy zararni undirsa böladimi?', when: 'Keça' },
  { id: 'c4', title: 'IIBga ariza qanday yoziladi', q: 'Ariza qanday yoziladi?', when: '18-noy' },
];
