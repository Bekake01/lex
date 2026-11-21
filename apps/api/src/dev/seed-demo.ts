import { eq } from 'drizzle-orm';
import { hashJson, sha256 } from '../common/hash.js';
import type { Db } from '../db/db.module.js';
import {
  aiEdits,
  aiIssues,
  aiReviewMessages,
  aiReviews,
  agencies,
  documents,
  recipientSummaries,
  recipients,
  signatureRequests,
  users,
  type SummaryBody,
} from '../db/schema/index.js';
import { DOCX_CONTENT_TYPE } from '../documents/documents.service.js';
import type { StorageService } from '../storage/storage.service.js';

/**
 * Staging seed for the frontend team: one sender with a document that already
 * has a finished review, a correction chat with a proposed edit, and a sent
 * signature request whose recipient summary is stored.
 *
 * It writes rows directly instead of running the jobs, so it needs no
^ * AI key and costs nothing — the point is to give the UI every state it
 * has to render, not to exercise the pipeline (the eval harness does that).
 */

const CONTRACT = `TURAR JOY IJARASI SHARTNOMASI

1. Ijaraga beruvchi Toshkent shahridagi kvartirani ijaraga oluvchiga foydalanishga topshiradi.
2. Ijara haqi oyiga 5 000 000 so'm, har oyning 5-sanasiga qadar to'lanadi.
3. Ijaraga beruvchi ijara haqini istalgan vaqtda, ijaraga oluvchini ogohlantirmasdan oshirishi mumkin.
4. Ijaraga oluvchi ikki oylik ijara haqi miqdorida depozit to'laydi. Depozit qaytarilmaydi.
5. Shartnoma muddati: bir yil.`;

const CITATION = {
  articleId: 'fx-civil-a556',
  actTitle: "O'zbekiston Respublikasining Fuqarolik kodeksi",
  articleNumber: '556',
  sourceUrl: 'https://lex.uz/docs/111181',
  versionDate: '2026-06-01',
};

export interface DemoSeed {
  userId: string;
  agencyId: string | null;
  documentId: string;
  reviewId: string;
  assistantMessageId: string;
  editId: string;
  signatureRequestId: string;
  recipientId: string;
  signToken: string;
}

export async function seedDemo(
  db: Db,
  storage: StorageService,
  options: { email?: string; withAgency?: boolean } = {},
): Promise<DemoSeed> {
  const email = (options.email ?? 'demo@lex.local').toLowerCase();

  let agencyId: string | null = null;
  if (options.withAgency) {
    const [agency] = await db
      .insert(agencies)
      .values({ name: 'Demo agency' })
      .returning({ id: agencies.id });
    agencyId = agency.id;
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      fullName: 'Demo Sender',
      agencyId,
      agencyRole: agencyId ? 'owner' : null,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { fullName: 'Demo Sender' },
    })
    .returning({ id: users.id, agencyId: users.agencyId });

  const bytes = new TextEncoder().encode(CONTRACT);
  const [document] = await db
    .insert(documents)
    .values({
      ownerUserId: user.id,
      agencyId: user.agencyId,
      name: 'ijara-shartnomasi.docx',
      contentType: DOCX_CONTENT_TYPE,
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
      storageKey: 'pending',
      extractedText: CONTRACT,
      extractedLanguage: 'uz-latn',
    })
    .returning();

  const storageKey = storage.buildKey(document.id, document.name);
  await storage.put(storageKey, bytes);
  await db
    .update(documents)
    .set({ storageKey, rootDocumentId: document.id })
    .where(eq(documents.id, document.id));

  const [review] = await db
    .insert(aiReviews)
    .values({
      documentId: document.id,
      requestedByUserId: user.id,
      agencyId: user.agencyId,
      status: 'done',
      language: 'uz',
      docType: 'rental',
      parties: [
        { name: 'Alisher Karimov', role: 'landlord' },
        { name: 'Dilnoza Yusupova', role: 'tenant' },
      ],
      riskLevel: 'high',
      verdict: 'needs_changes',
      summary:
        "Shartnoma asosan to'g'ri tuzilgan, lekin ijara haqini bir tomonlama oshirish va depozitni qaytarmaslik shartlari ijaraga oluvchi uchun jiddiy xavf tug'diradi.",
      lawVersionDate: '2026-06-01',
      promptVersion: 'seed',
      model: 'gpt-5',
      inputTokens: 48_000,
      outputTokens: 3_200,
      costUsd: '0.256000',
      idempotencyKey: `${document.id}:${document.sha256}:seed:uz`,
      startedAt: new Date(),
      finishedAt: new Date(),
    })
    .returning();

  await db.insert(aiIssues).values([
    {
      reviewId: review.id,
      clauseRef: '3',
      quote:
        'Ijaraga beruvchi ijara haqini istalgan vaqtda, ijaraga oluvchini ogohlantirmasdan oshirishi mumkin.',
      problem:
        'Ijara haqini cheklovsiz va ogohlantirishsiz oshirish huquqi ijaraga oluvchini noaniq majburiyat ostida qoldiradi.',
      severity: 'high' as const,
      recommendation:
        'Oshirish chastotasini, maksimal foizni va kamida 30 kunlik yozma ogohlantirish muddatini belgilang.',
      citation: CITATION,
      orderIndex: 0,
    },
    {
      reviewId: review.id,
      clauseRef: '4',
      quote: 'Depozit qaytarilmaydi.',
      problem:
        'Depozitni hech qanday holatda qaytarmaslik sharti depozitning maqsadiga qarshi.',
      severity: 'high' as const,
      recommendation:
        "Depozit nimalar uchun ushlab qolinishini sanab o'ting va qolgan qismi necha kun ichida qaytarilishini yozing.",
      // Deliberately uncited: the UI has to render "no supporting norm found".
      citation: null,
      orderIndex: 1,
    },
  ]);

  const [userMessage] = await db
    .insert(aiReviewMessages)
    .values({
      reviewId: review.id,
      authorUserId: user.id,
      role: 'user',
      text: '3-bandni tuzating: ijara haqini oshirish tartibini aniq yozing.',
      status: 'done',
    })
    .returning({ id: aiReviewMessages.id });

  const [assistantMessage] = await db
    .insert(aiReviewMessages)
    .values({
      reviewId: review.id,
      role: 'assistant',
      text: "3-bandga oshirish chastotasi, maksimal foiz va 30 kunlik ogohlantirish muddatini qo'shdim.",
      status: 'done',
      replyToMessageId: userMessage.id,
    })
    .returning({ id: aiReviewMessages.id });

  const [edit] = await db
    .insert(aiEdits)
    .values({
      messageId: assistantMessage.id,
      reviewId: review.id,
      documentId: document.id,
      clauseRef: '3',
      original:
        'Ijaraga beruvchi ijara haqini istalgan vaqtda, ijaraga oluvchini ogohlantirmasdan oshirishi mumkin.',
      replacement:
        "Ijaraga beruvchi ijara haqini yiliga bir martadan ko'p bo'lmagan holda, 10 foizdan oshmagan miqdorda va kamida 30 kun oldin yozma ogohlantirgan holda oshirishi mumkin.",
      reason:
        'Oshirish huquqini chastota, miqdor va ogohlantirish muddati bilan cheklaydi.',
      citation: CITATION,
      status: 'proposed',
      orderIndex: 0,
    })
    .returning({ id: aiEdits.id });

  const body: SummaryBody = {
    overview:
      "Bu turar joy ijarasi shartnomasi. Siz ijaraga oluvchi sifatida kvartirada bir yil yashash huquqini olasiz va har oy ijara haqini to'lash majburiyatini olasiz.",
    yourObligations: [
      {
        text: "Har oyning 5-sanasiga qadar 5 000 000 so'm ijara haqini to'lash",
        deadline: 'har oyning 5-sanasi',
        clauseRef: '2',
      },
      {
        text: "Ikki oylik ijara haqi miqdorida depozit to'lash",
        clauseRef: '4',
      },
    ],
    otherObligations: [
      {
        text: 'Kvartirani foydalanishga topshirish',
        clauseRef: '1',
      },
    ],
    keyConditions: [
      { label: 'Ijara haqi', value: "oyiga 5 000 000 so'm" },
      { label: 'Depozit', value: 'ikki oylik ijara haqi' },
      { label: 'Muddat', value: '1 yil' },
    ],
    youGet: [
      {
        text: 'Yunusobod tumanidagi ikki xonali kvartirada yashash huquqi',
        clauseRef: '1',
      },
    ],
    youGive: [
      { text: "Har oy 5 000 000 so'm ijara haqi", clauseRef: '2' },
      { text: 'Ikki oylik ijara haqi miqdorida depozit', clauseRef: '4' },
    ],
    deadlines: [
      {
        when: 'har oyning 5-sanasi',
        what: "Ijara haqini to'lash",
        who: 'you',
        clauseRef: '2',
      },
    ],
    watchOut: [
      {
        text: 'Depozitingiz hech qachon qaytarilmaydi.',
        severity: 'high',
        clauseRef: '4',
      },
      {
        text: 'Ijaraga beruvchi ijara haqini istalgan vaqtda, sizni ogohlantirmasdan oshirishi mumkin.',
        severity: 'high',
        clauseRef: '3',
      },
    ],
    howToEnd: [
      {
        text: 'Shartnomada muddatidan oldin bekor qilish tartibi yozilmagan.',
        clauseRef: '',
      },
    ],
  };

  const token = `demo-${sha256(`${document.id}:signer`).slice(0, 40)}`;
  const [request] = await db
    .insert(signatureRequests)
    .values({
      documentId: document.id,
      createdByUserId: user.id,
      agencyId: user.agencyId,
      title: document.name,
      status: 'sent',
      documentHash: document.sha256,
      summaryLanguage: 'uz',
      summariesStatus: 'done',
      sentAt: new Date(),
    })
    .returning({ id: signatureRequests.id });

  const [recipient] = await db
    .insert(recipients)
    .values({
      signatureRequestId: request.id,
      email: 'signer@lex.local',
      fullName: 'Dilnoza Yusupova',
      partyName: 'Dilnoza Yusupova',
      token,
    })
    .returning({ id: recipients.id, token: recipients.token });

  const summaryHash = hashJson(body);
  await db.insert(recipientSummaries).values({
    signatureRequestId: request.id,
    recipientId: recipient.id,
    partyName: 'Dilnoza Yusupova',
    language: 'uz',
    body,
    summaryHash,
  });
  await db
    .update(signatureRequests)
    .set({
      summaryHash: hashJson([
        {
          recipientId: recipient.id,
          partyName: 'Dilnoza Yusupova',
          language: 'uz',
          summaryHash,
        },
      ]),
    })
    .where(eq(signatureRequests.id, request.id));

  return {
    userId: user.id,
    agencyId: user.agencyId,
    documentId: document.id,
    reviewId: review.id,
    assistantMessageId: assistantMessage.id,
    editId: edit.id,
    signatureRequestId: request.id,
    recipientId: recipient.id,
    signToken: recipient.token,
  };
}
