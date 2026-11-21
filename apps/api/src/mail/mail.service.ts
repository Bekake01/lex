import { Inject, Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ENV, type Env } from '../config/env.js';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend drops a repeat with the same key (24h), so job retries are safe. */
  idempotencyKey?: string;
}

/** The only place that talks to Resend. Always sends from `MAIL_FROM`. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  }

  get enabled(): boolean {
    return this.resend !== null;
  }

  async send({ to, subject, html, text, idempotencyKey }: SendEmailParams) {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY not set: email to ${to} not sent`);
      return;
    }
    const { data, error } = await this.resend.emails.send(
      { from: this.env.MAIL_FROM, to: [to], subject, html, text },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    if (error) {
      throw new Error(`Resend: [${error.name}] ${error.message}`);
    }
    this.logger.log(`email sent to ${to} (id ${data?.id})`);
  }
}
