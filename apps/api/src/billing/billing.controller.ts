import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  PLANS,
  type BillingOverviewWire,
  type CheckoutBody,
  type InvitePreviewWire,
  type PaymentWire,
  type PlanInfo,
  type TeamInviteWire,
  type TeamWire,
} from '@lex/contracts';
import type { Request, Response } from 'express';
import { clientInfo, type SignedInResponse } from '../auth/auth.controller.js';
import { Public } from '../auth/auth.decorators.js';
import { setRefreshCookie, type RefreshCookieConfig } from '../auth/refresh-cookie.js';
import {
  CurrentUserGuard,
  User,
  type CurrentUser,
} from '../common/current-user.js';
import { ENV, type Env } from '../config/env.js';
import { BillingService } from './billing.service.js';
import { TeamService } from './team.service.js';

function parseCheckout(body: unknown): CheckoutBody {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.plan !== 'individual' && b.plan !== 'company') {
    throw new BadRequestException('plan must be individual or company');
  }
  if (b.interval !== 'month' && b.interval !== 'year') {
    throw new BadRequestException('interval must be month or year');
  }
  if (
    b.seats !== undefined &&
    (!Number.isInteger(b.seats) || (b.seats as number) > 1000)
  ) {
    throw new BadRequestException('seats must be a whole number');
  }
  return {
    plan: b.plan,
    interval: b.interval,
    seats: b.seats as number | undefined,
    companyName: typeof b.companyName === 'string' ? b.companyName : undefined,
  };
}

/** Public: the price list for the pricing page. */
@Public()
@Controller('billing')
export class PlansController {
  @Get('plans')
  plans(): PlanInfo[] {
    return Object.values(PLANS);
  }
}

@Controller('billing')
@UseGuards(CurrentUserGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Plan, usage against it, and the team's seats. */
  @Get('me')
  me(@User() user: CurrentUser): Promise<BillingOverviewWire> {
    return this.billing.overview(user);
  }

  @Get('payments')
  payments(@User() user: CurrentUser): Promise<PaymentWire[]> {
    return this.billing.payments(user);
  }

  /** Test payment: the plan starts at once. */
  @Post('checkout')
  @HttpCode(200)
  checkout(
    @User() user: CurrentUser,
    @Body() body: unknown,
  ): Promise<BillingOverviewWire> {
    return this.billing.checkout(user, parseCheckout(body));
  }

  @Post('cancel')
  @HttpCode(200)
  cancel(@User() user: CurrentUser): Promise<BillingOverviewWire> {
    return this.billing.cancel(user);
  }

  @Post('resume')
  @HttpCode(200)
  resume(@User() user: CurrentUser): Promise<BillingOverviewWire> {
    return this.billing.resume(user);
  }

  @Patch('seats')
  seats(
    @User() user: CurrentUser,
    @Body() body: { seats?: unknown },
  ): Promise<BillingOverviewWire> {
    return this.billing.changeSeats(user, Number(body?.seats));
  }
}

@Controller('team')
@UseGuards(CurrentUserGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  get(@User() user: CurrentUser): Promise<TeamWire> {
    return this.team.get(user);
  }

  /** Returns the invite with its link (emails aren't sent yet). */
  @Post('invites')
  invite(
    @User() user: CurrentUser,
    @Body() body: { email?: unknown; role?: unknown },
  ): Promise<TeamInviteWire> {
    return this.team.invite(user, body ?? {});
  }

  @Delete('invites/:id')
  @HttpCode(204)
  revoke(@User() user: CurrentUser, @Param('id') id: string): Promise<void> {
    return this.team.revokeInvite(user, id);
  }

  @Delete('members/:id')
  @HttpCode(204)
  remove(@User() user: CurrentUser, @Param('id') id: string): Promise<void> {
    return this.team.removeMember(user, id);
  }

  @Patch('members/:id')
  @HttpCode(204)
  role(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: { role?: unknown },
  ): Promise<void> {
    return this.team.changeRole(user, id, body?.role);
  }
}

/** The invite link's page: no sign-in needed; the token is the credential. */
@Public()
@Controller('invites')
export class InvitesController {
  private readonly cookie: RefreshCookieConfig;

  constructor(
    private readonly team: TeamService,
    @Inject(ENV) env: Env,
  ) {
    this.cookie = {
      secure: env.NODE_ENV === 'production',
      path: env.REFRESH_COOKIE_PATH,
    };
  }

  @Get(':token')
  preview(@Param('token') token: string): Promise<InvitePreviewWire> {
    return this.team.preview(token);
  }

  /** Joins the company and signs in (sets the refresh cookie like login). */
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body() body: { password?: unknown; fullName?: unknown },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignedInResponse> {
    const result = await this.team.accept(
      token,
      {
        password: typeof body?.password === 'string' ? body.password : '',
        fullName: typeof body?.fullName === 'string' ? body.fullName : undefined,
      },
      clientInfo(req),
    );
    setRefreshCookie(res, result.session, this.cookie);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }
}
