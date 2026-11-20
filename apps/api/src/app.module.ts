import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbModule } from './db/db.module.js';
import { UsersController } from './users/users.controller.js';

@Module({
  imports: [DbModule],
  controllers: [AppController, UsersController],
  providers: [AppService],
})
export class AppModule {}
