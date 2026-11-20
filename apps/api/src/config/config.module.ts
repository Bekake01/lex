import { Global, Module } from '@nestjs/common';
import { ENV, parseEnv, type Env } from './env.js';

/** Global so any provider can `@Inject(ENV)`. Parsed once at boot. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => parseEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
