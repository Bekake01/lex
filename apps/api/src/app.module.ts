import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { LawModule } from './law/law.module.js';
import { MeController } from './me/me.controller.js';

@Module({
  imports: [ConfigModule, DbModule, AuthModule, LawModule],
  controllers: [AppController, HealthController, MeController],
  providers: [AppService],
})
export class AppModule {}
