import { Body } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/**
 * `@ZodBody(schemaFromContracts) body: Shape` — the request body is validated
 * against the shared schema before a handler sees it, so the trust boundary is
 * the contract file and not the controller.
 */
export function ZodBody<T>(schema: ZodType<T>): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}
