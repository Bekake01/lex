import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { LawModule } from './law/law.module.js';
import { UsersController } from './users/users.controller.js';

@Module({
  imports: [ConfigModule, DbModule, LawModule],
  controllers: [AppController, HealthController, UsersController],
  providers: [AppService],
})
export class AppModule {}
