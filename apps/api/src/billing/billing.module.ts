import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  BillingController,
  InvitesController,
  PlansController,
  TeamController,
} from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { TeamService } from './team.service.js';

/** Plans, test payments, company seats and invites. Limits: AiUsageService. */
@Module({
  imports: [AuthModule],
  controllers: [
    PlansController,
    BillingController,
    TeamController,
    InvitesController,
  ],
  providers: [BillingService, TeamService],
})
export class BillingModule {}
