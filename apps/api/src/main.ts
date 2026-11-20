import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { parseEnv } from './config/env.js';

// Local development reads .env; in deployment the platform sets the variables.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  // Fail fast with a readable list of bad keys before Nest starts.
  const env = parseEnv(process.env);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // credentials: the browser sends the refresh cookie to /auth.
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
