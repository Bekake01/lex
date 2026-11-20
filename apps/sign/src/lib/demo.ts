// Demo content until GET /sign/:token/summary exists in apps/api.
// Shape follows ROADMAP §4.4 recipient_summaries. Sample text, not legal advice.

export const signingRequest = {
  title: 'Turar joy ijarasi şartnomasi №12',
  sender: { name: 'Karimov Akmal Rustamoviç', role: 'Ijaraga beruvçi' },
  recipient: { name: 'Yusupova Dilnoza Bahodirovna', role: 'Ijaraçi' },
  sentAt: '2026-yil 20-noyabr',
  note: 'Assalomu alaykum! Ijara şartnomasini körib çiqib, imzolaşingizni sörayman.',
  summary:
    'Siz Yunusobod tumanidagi 2 xonali kvartirani 11 oyga ijaraga olasiz. Oylik tölov 5,6 mln söm, har oyning 5-sanasigaça. Şartnoma tugaganda garov puli 10 kun içida qaytariladi.',
  keyTerms: [
    { label: 'Muddat', value: '1-dek 2026 — 31-okt 2027' },
    { label: 'Oylik tölov', value: '5 600 000 söm' },
    { label: 'Garov puli', value: '5 600 000 söm' },
    { label: 'Bekor qiliş', value: '1 oy oldin yozma ogohlantiriş' },
  ],
  yourObligations: [
    'Har oyning 5-sanasigaça 5 600 000 söm ijara haqini tölaş',
    'Imzolaş kuni 5 600 000 söm garov puli tölaş',
    'Kvartiradan faqat yaşaş uçun foydalaniş va uni saqlaş',
    'Keçikkan tölov uçun kuniga 0,3% penya (oylik haqning 50% gaça)',
  ],
  otherObligations: [
    'Kvartirani 1-dekabrgaça yaşaşga yaroqli holda topşiriş',
    'Garov pulini şartnoma tugagaç 10 kun içida qaytariş',
    'Şartnomani soliq organida hisobga qöyiş',
  ],
  clauses: [
    { n: 1, title: 'Şartnoma predmeti', text: 'Ijaraga beruvçi Toşkent ş., Yunusobod tumani, 4-mavze, 12-uy, 45-xonadonda joylaşgan 2 xonali turar joyni (umumiy maydoni 54 kv.m) Ijaraçiga yaşaş uçun vaqtinça foydalanişga beradi.' },
    { n: 2, title: 'Ijara muddati', text: 'Şartnoma 2026-yil 1-dekabrdan 2027-yil 31-oktabrgaça bölgan muddatga (11 oy) tuziladi.' },
    { n: 3, title: 'Ijara haqi', text: 'Oylik ijara haqi 5 600 000 (beş million olti yuz ming) söm miqdorida belgilanadi va har oyning 5-sanasigaça Ijaraga beruvçining bank hisob raqamiga ötkaziş yoki naqd sömda tölanadi.' },
    { n: 4, title: 'Garov puli', text: 'Ijaraçi şartnoma imzolangan kuni 5 600 000 söm miqdorida garov puli tölaydi. Garov puli şartnoma muddati tugaganidan keyin 10 kun içida, turar joyga yetkazilgan zarar va tölanmagan qarzlar çegirilgan holda, Ijaraçiga qaytariladi.' },
    { n: 5, title: 'Şartnomani bekor qiliş', text: 'Har bir tomon şartnomani muddatidan oldin bekor qiliş haqida ikkinçi tomonni kamida 1 (bir) oy oldin yozma ravişda ogohlantirgan holda bekor qilişga haqli.' },
    { n: 6, title: 'Javobgarlik', text: 'Ijara haqi keçiktirilganda Ijaraçi har bir keçiktirilgan kun uçun tölanmagan summaning 0,3 foizi miqdorida penya tölaydi, biroq penyaning umumiy miqdori oylik ijara haqining 50 foizidan oşmasligi kerak.' },
    { n: 7, title: 'Nizolarni hal qiliş', text: 'Tomonlar örtasidagi nizolar muzokaralar yöli bilan, kelişuvga erişilmaganda esa Özbekiston Respublikasi qonunçiligiga muvofiq sud tartibida hal qilinadi.' },
    { n: 8, title: 'Yakuniy qoidalar', text: 'Şartnoma ikki nusxada tuziladi, har bir nusxa teng yuridik kuçga ega. Şartnoma tomonlar imzolagan paytdan kuçga kiradi.' },
  ],
  documentHash: '9f2c4e81a7d03b6c55e19f0a2b7d4c8e61f3a09b2d7e5c14a8f6b30d9e2c7a51',
};
