import { planPrice } from '@lex/contracts';
import { eq } from 'drizzle-orm';
import type { AuthService } from '../src/auth/auth.service.js';
import { PasswordHasher } from '../src/auth/password.js';
import { addInterval, BillingService } from '../src/billing/billing.service.js';
import { TeamService } from '../src/billing/team.service.js';
import type { CurrentUser } from '../src/common/current-user.js';
import type { Env } from '../src/config/env.js';
import type { Db } from '../src/db/db.module.js';
import { payments, users } from '../src/db/schema/index.js';
import { AiUsageService } from '../src/usage/ai-usage.service.js';
import { createTestDb, seedUser } from './helpers/test-db.js';

const noTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
};

/** The parts of AuthService the team service uses, without sessions/JWTs. */
function fakeAuth(): AuthService {
  const hasher = new PasswordHasher();
  return {
    verifyPassword: (h: string | null, p: string) => hasher.verify(h, p),
    hashPassword: (p: string) => hasher.hash(p),
    signIn: async (user: { id: string; email: string; fullName: string }) => ({
      accessToken: 'token',
      expiresIn: 900,
      user,
      session: {},
    }),
  } as unknown as AuthService;
}

describe('plan prices', () => {
  it('prices plans per month and per year with 20% off', () => {
    expect(planPrice('individual', 'month')).toBe(59_000);
    expect(planPrice('individual', 'year')).toBe(566_400);
    expect(planPrice('company', 'month')).toBe(299_000);
    expect(planPrice('company', 'month', 7)).toBe(299_000 + 2 * 49_000);
    expect(planPrice('company', 'year', 5)).toBe(2_870_400);
  });

  it('adds a month or a year', () => {
    const from = new Date('2026-01-31T00:00:00Z');
    expect(addInterval(from, 'year').toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });
});

describe('billing and teams', () => {
  let db: Db;
  let close: () => Promise<void>;
  let billing: BillingService;
  let usage: AiUsageService;
  let team: TeamService;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    billing = new BillingService(db);
    usage = new AiUsageService(db);
    team = new TeamService(
      db,
      { WEB_ORIGIN: 'http://localhost:3000' } as Env,
      billing,
      fakeAuth(),
    );
  });

  afterAll(async () => {
    await close();
  });

  async function individual(): Promise<CurrentUser> {
    const u = await seedUser(db);
    return { id: u.id, agencyId: null, agencyRole: null };
  }

  it('a new account has 3 lifetime checks, then 402 until it pays', async () => {
    const user = await individual();
    expect((await billing.overview(user)).checks).toMatchObject({
      used: 0,
      limit: 3,
      lifetime: true,
    });

    for (let i = 0; i < 3; i++) {
      await usage.recordReview({ userId: user.id, agencyId: null }, noTokens);
    }
    await expect(usage.assertReviewAllowed(user)).rejects.toMatchObject({
      status: 402,
    });

    const after = await billing.checkout(user, {
      plan: 'individual',
      interval: 'month',
    });
    expect(after.plan).toBe('individual');
    // This month's 3 reviews count against the monthly 20.
    expect(after.checks).toMatchObject({ used: 3, limit: 20, lifetime: false });
    await expect(usage.assertReviewAllowed(user)).resolves.toBeUndefined();

    const paid = await billing.payments(user);
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ provider: 'test', amount: 59_000, status: 'paid' });
  });

  it('buying the same plan again extends it by one period', async () => {
    const user = await individual();
    const first = await billing.checkout(user, { plan: 'individual', interval: 'month' });
    const second = await billing.checkout(user, { plan: 'individual', interval: 'month' });
    const end1 = new Date(first.subscription!.currentPeriodEnd);
    const end2 = new Date(second.subscription!.currentPeriodEnd);
    expect(end2.toISOString()).toBe(addInterval(end1, 'month').toISOString());
  });

  it('cancel keeps the plan until the period ends; resume undoes it', async () => {
    const user = await individual();
    await billing.checkout(user, { plan: 'individual', interval: 'year' });
    const canceled = await billing.cancel(user);
    expect(canceled.plan).toBe('individual');
    expect(canceled.subscription?.cancelAtPeriodEnd).toBe(true);
    expect((await billing.resume(user)).subscription?.cancelAtPeriodEnd).toBe(false);
  });

  it('company checkout makes the buyer the owner, then invites fill the seats', async () => {
    const buyer = await individual();
    const company = await billing.checkout(buyer, {
      plan: 'company',
      interval: 'month',
      companyName: 'Huquq LLC',
    });
    expect(company.plan).toBe('company');
    expect(company.team).toMatchObject({ agencyName: 'Huquq LLC', role: 'owner', seats: 5 });
    expect(company.checks.limit).toBe(150);

    const owner: CurrentUser = { id: buyer.id, agencyId: company.team.agencyId, agencyRole: 'owner' };

    // 4 invites fill the 5 seats (the owner holds one).
    const invites = [];
    for (let i = 0; i < 4; i++) {
      invites.push(await team.invite(owner, { email: `person${i}-${Date.now()}@example.com` }));
    }
    expect(invites[0].inviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\/[\w-]{43}$/);
    await expect(team.invite(owner, { email: 'one-too-many@example.com' })).rejects.toMatchObject({
      status: 409,
    });

    // One more seat (charged now) makes room.
    await billing.changeSeats(owner, 6);
    await team.invite(owner, { email: `sixth-${Date.now()}@example.com` });
    const seatPayment = (await billing.payments(owner)).find((p) => p.description.startsWith('+1'));
    expect(seatPayment?.amount).toBe(49_000);

    // A new person accepts with a name and password, and joins as a member.
    const token = invites[0].inviteUrl!.split('/').pop()!;
    const preview = await team.preview(token);
    expect(preview).toMatchObject({ agencyName: 'Huquq LLC', existingAccount: false });
    const signedIn = await team.accept(token, { fullName: 'Yangi Xodim', password: 'parol-123' }, {
      userAgent: null,
      ip: null,
    });
    const [joined] = await db.select().from(users).where(eq(users.id, signedIn.user.id));
    expect(joined).toMatchObject({ agencyId: owner.agencyId, agencyRole: 'member' });

    // The link works once.
    await expect(team.preview(token)).rejects.toMatchObject({ status: 404 });

    // Members share the company quota and can't manage billing.
    const member: CurrentUser = { id: joined.id, agencyId: owner.agencyId, agencyRole: 'member' };
    await usage.recordReview({ userId: member.id, agencyId: member.agencyId }, noTokens);
    expect((await billing.overview(owner)).checks.used).toBe(1);
    await expect(team.invite(member, { email: 'x@example.com' })).rejects.toMatchObject({ status: 403 });
    await expect(billing.cancel(member)).rejects.toMatchObject({ status: 403 });

    const view = await team.get(owner);
    expect(view.members).toHaveLength(2);
    expect(view.invites).toHaveLength(4);
    expect(view.seats).toBe(6);

    // Removing a member frees their seat; they keep a free account.
    await team.removeMember(owner, member.id);
    const [left] = await db.select().from(users).where(eq(users.id, member.id));
    expect(left.agencyId).toBeNull();
  });

  it('an existing account joins by confirming its password', async () => {
    const buyer = await individual();
    const company = await billing.checkout(buyer, {
      plan: 'company',
      interval: 'year',
      companyName: 'Notarius',
    });
    const owner: CurrentUser = { id: buyer.id, agencyId: company.team.agencyId, agencyRole: 'owner' };

    const email = `existing-${Date.now()}@example.com`;
    const hash = await new PasswordHasher().hash('eski-parol-1');
    await db.insert(users).values({ email, fullName: 'Bor Hisob', passwordHash: hash });

    const invite = await team.invite(owner, { email, role: 'admin' });
    const token = invite.inviteUrl!.split('/').pop()!;
    expect((await team.preview(token)).existingAccount).toBe(true);
    await expect(team.accept(token, { password: 'wrong-password' }, { userAgent: null, ip: null })).rejects.toMatchObject({
      status: 401,
    });
    await team.accept(token, { password: 'eski-parol-1' }, { userAgent: null, ip: null });
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row.agencyRole).toBe('admin');

    const yearly = await db.select().from(payments).where(eq(payments.scopeKey, `agency:${owner.agencyId}`));
    expect(yearly[0].amount).toBe(2_870_400);
  });

  it('a free account can send 3 documents for signature', async () => {
    const user = await individual();
    const overview = await billing.overview(user);
    expect(overview.sends).toEqual({ used: 0, limit: 3 });
    await expect(usage.assertSendAllowed(user)).resolves.toBeUndefined();
  });

  it('an individual inside a company cannot buy the individual plan', async () => {
    const u = await seedUser(db, { agency: true });
    const owner: CurrentUser = { id: u.id, agencyId: u.agencyId, agencyRole: 'owner' };
    await expect(billing.checkout(owner, { plan: 'individual', interval: 'month' })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('parseRegisterBody', () => {
  it('normalizes the email and needs a name and an 8+ character password', async () => {
    const { parseRegisterBody } = await import('../src/auth/request-bodies.js');
    expect(parseRegisterBody({ email: ' Ali@Mail.UZ ', password: '12345678', fullName: ' Ali ' })).toEqual({
      email: 'ali@mail.uz',
      password: '12345678',
      fullName: 'Ali',
      rememberMe: false,
    });
    expect(() => parseRegisterBody({ email: 'ali@mail.uz', password: 'short', fullName: 'Ali' })).toThrow();
    expect(() => parseRegisterBody({ email: 'ali@mail.uz', password: '12345678' })).toThrow();
    expect(() => parseRegisterBody({ email: 'not-an-email', password: '12345678', fullName: 'Ali' })).toThrow();
  });
});
