// Demo content for the UI until apps/api has the real endpoints.
// What is left: severity styles (used by the real review screen) and the sidebar's demo lists.

export type Severity = 'high' | 'medium' | 'low';

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

/** Recent Q&A chats for the sidebar (demo until the API stores chats). */
export const recentChats: { id: string; title: string; q: string; when: string }[] = [
  { id: 'c1', title: 'Urib ketişdi, nima qilay?', q: 'Meni kimdir urib ketdi, nima qilişim kerak?', when: 'Bugun' },
  { id: 'c2', title: 'Ikki oylik maoş berilmayapti', q: 'Ish beruvçi 2 oydan beri maoş bermayapti', when: 'Keça' },
  { id: 'c3', title: 'Maʼnaviy zarar qanday undiriladi', q: 'Maʼnaviy zararni undirsa böladimi?', when: 'Keça' },
  { id: 'c4', title: 'IIBga ariza qanday yoziladi', q: 'Ariza qanday yoziladi?', when: '18-noy' },
];
