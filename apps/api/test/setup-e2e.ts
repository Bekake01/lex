import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';

// The e2e specs boot the real AppModule, which validates the environment the
// same way `main.ts` does, so they need the same `.env`.
if (existsSync('.env')) process.loadEnvFile('.env');
Logger.overrideLogger(false);
