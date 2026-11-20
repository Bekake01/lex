import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'lex:isPublic';

/** Opts a route out of the API key check. Only `/health` should use it. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
