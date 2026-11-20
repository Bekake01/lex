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

  // No CORS: lex-api is called server-to-server only, never from a browser.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
