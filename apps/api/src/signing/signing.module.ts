import { Module } from '@nestjs/common';
import { SigningController } from './signing.controller.js';
import { SigningService } from './signing.service.js';

@Module({
  controllers: [SigningController],
  providers: [SigningService],
  exports: [SigningService],
})
export class SigningModule {}
