/**
 * Plans, prices and wire types for billing: one place for the API and the UI.
 *
 * Prices are whole Uzbek so'm. A "check" is one AI review of a document.
 * Free accounts get FREE_CHECKS for the account's lifetime; paid plans get a
 * monthly quota (calendar month, UTC) that resets on the 1st.
 */

export type PlanId = 'free' | 'individual' | 'company';
export type PaidPlanId = Exclude<PlanId, 'free'>;
export type BillingInterval = 'month' | 'year';
export type TeamRole = 'owner' | 'admin' | 'member';

/** Lifetime AI checks for an account with no subscription. */
export const FREE_CHECKS = 3;
/** Lifetime signature sends for an account with no subscription. */
export const FREE_SENDS = 3;
/** Yearly billing = 12 months minus this percentage. */
export const YEARLY_DISCOUNT_PERCENT = 20;

export interface PlanInfo {
  id: PlanId;
  name: string;
  /** Per month, for the base seats. 0 = free. */
  monthlyPrice: number;
  /** AI checks per month (free: lifetime). */
  checks: number;
  /** Seats included in the base price (company only > 1). */
  includedSeats: number;
  /** Per extra seat per month (company only). */
  extraSeatPrice: number;
  /** Signature sends; null = unlimited. */
  sends: number | null;
  features: string[];
}

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Bepul',
    monthlyPrice: 0,
    checks: FREE_CHECKS,
    includedSeats: 1,
    extraSeatPrice: 0,
    sends: FREE_SENDS,
    features: [
      '3 ta AI tekşiruv (röyxatdan ötganda)',
      '3 ta hujjatni imzoga yuboriş',
      'Qonun moddalariga havolalar',
    ],
  },
  individual: {
    id: 'individual',
    name: 'Şaxsiy',
    monthlyPrice: 59_000,
    checks: 20,
    includedSeats: 1,
    extraSeatPrice: 0,
    sends: null,
    features: [
      'Oyiga 20 ta AI tekşiruv',
      'Cheksiz imzoga yuboriş',
      'AI tuzatişlari va yangi versiyalar',
      'Imzolovçilar uçun qisqa mazmun',
    ],
  },
  company: {
    id: 'company',
    name: 'Kompaniya',
    monthlyPrice: 299_000,
    checks: 150,
    includedSeats: 5,
    extraSeatPrice: 49_000,
    sends: null,
    features: [
      '5 ta foydalanuvçi kiritilgan',
      'Oyiga 150 ta umumiy AI tekşiruv',
      'Qöşimça foydalanuvçi — 49 000 söm/oy',
      'Jamoani email orqali taklif qiliş',
      'Rollar: egasi, admin, aʼzo',
    ],
  },
};

/** Price for one billing period (month or year), in so'm. */
export function planPrice(
  plan: PaidPlanId,
  interval: BillingInterval,
  seats = PLANS[plan].includedSeats,
): number {
  const info = PLANS[plan];
  const extra = Math.max(0, seats - info.includedSeats);
  const monthly = info.monthlyPrice + extra * info.extraSeatPrice;
  if (interval === 'month') return monthly;
  return Math.round((monthly * 12 * (100 - YEARLY_DISCOUNT_PERCENT)) / 100);
}

/** Price of `added` seats for one period (a seat change is charged at once). */
export function seatsPrice(added: number, interval: BillingInterval): number {
  const monthly = added * PLANS.company.extraSeatPrice;
  if (interval === 'month') return monthly;
  return Math.round((monthly * 12 * (100 - YEARLY_DISCOUNT_PERCENT)) / 100);
}

/* ------------------------------------------------------------- wire types -- */

export interface SubscriptionWire {
  id: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  seats: number;
  status: 'active' | 'canceled';
  /** ISO time the paid period ends. */
  currentPeriodEnd: string;
  /** Ends at currentPeriodEnd instead of renewing. */
  cancelAtPeriodEnd: boolean;
}

/** GET /billing/me */
export interface BillingOverviewWire {
  plan: PlanId;
  subscription: SubscriptionWire | null;
  checks: {
    used: number;
    limit: number;
    /** true on the free plan: the limit is for the account's lifetime. */
    lifetime: boolean;
    /** `YYYY-MM` for monthly quotas, null for lifetime. */
    period: string | null;
  };
  sends: { used: number; limit: number | null };
  team: {
    agencyId: string | null;
    agencyName: string | null;
    role: TeamRole | null;
    members: number;
    seats: number;
  };
  /** Owner/admin of the agency, or an individual: may pay, cancel, invite. */
  canManage: boolean;
}

export interface PaymentWire {
  id: string;
  provider: 'test' | 'payme' | 'click';
  amount: number;
  status: 'paid' | 'failed';
  description: string;
  createdAt: string;
}

/** POST /billing/checkout */
export interface CheckoutBody {
  plan: PaidPlanId;
  interval: BillingInterval;
  /** Company only; default and minimum PLANS.company.includedSeats. */
  seats?: number;
  /** Company only, when the account isn't in an agency yet. */
  companyName?: string;
}

export interface TeamMemberWire {
  id: string;
  email: string;
  fullName: string;
  role: TeamRole;
  /** false until an invited user set a password. */
  active: boolean;
}

export interface TeamInviteWire {
  id: string;
  email: string;
  role: Exclude<TeamRole, 'owner'>;
  expiresAt: string;
  /** Only in the POST response: the link to send to the person. */
  inviteUrl?: string;
}

/** GET /team */
export interface TeamWire {
  agencyId: string;
  agencyName: string;
  seats: number;
  members: TeamMemberWire[];
  invites: TeamInviteWire[];
}

/** GET /invites/:token (public) */
export interface InvitePreviewWire {
  agencyName: string;
  email: string;
  invitedBy: string;
  /** true: sign in with the existing password; false: choose name + password. */
  existingAccount: boolean;
}

export const BILLING_ROUTES = {
  plans: '/billing/plans',
  me: '/billing/me',
  checkout: '/billing/checkout',
  cancel: '/billing/cancel',
  resume: '/billing/resume',
  seats: '/billing/seats',
  payments: '/billing/payments',
  team: '/team',
  teamInvites: '/team/invites',
  teamInvite: (id: string) => `/team/invites/${id}`,
  teamMember: (id: string) => `/team/members/${id}`,
  invite: (token: string) => `/invites/${token}`,
  inviteAccept: (token: string) => `/invites/${token}/accept`,
  register: '/auth/register',
} as const;

export const BILLING_ERROR_CODES = {
  /** No AI checks left on this plan (402). Same code the review route used. */
  checkLimitReached: 'REVIEW_LIMIT_REACHED',
  /** Free signature sends used up (402). */
  sendLimitReached: 'SEND_LIMIT_REACHED',
  /** Every seat is taken; add seats first (409). */
  seatsFull: 'SEATS_FULL',
  /** Only the owner or an admin can do this (403). */
  notManager: 'NOT_MANAGER',
  /** The email is already registered (409). */
  emailTaken: 'EMAIL_TAKEN',
  /** Invite link expired, used or unknown (404). */
  inviteInvalid: 'INVITE_INVALID',
  /** The user already belongs to a company (409). */
  alreadyInTeam: 'ALREADY_IN_TEAM',
} as const;
