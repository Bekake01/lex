import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { ArticlesBatchResponse, MetaResponse, SearchResponse } from '../law.types.js';
import { articlesBatchRequestSchema, parseBody, searchRequestSchema } from './schemas.js';
import { SearchService } from './search.service.js';
import { Public } from '../../auth/auth.decorators.js';

/** Law search over HTTP (for testing and the frontend); the AI review calls SearchService directly. */
// Public for now so the AI team can test with curl; put behind login later.
@Public()
@Controller('law')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Post('search')
  @HttpCode(200)
  async searchLaw(@Body() body: unknown): Promise<SearchResponse> {
    return { hits: await this.search.search(parseBody(searchRequestSchema, body)) };
  }

  @Post('articles/batch')
  @HttpCode(200)
  async batch(@Body() body: unknown): Promise<ArticlesBatchResponse> {
    const { ids } = parseBody(articlesBatchRequestSchema, body);
    return { articles: await this.search.articles(ids) };
  }

  @Get('meta')
  meta(): Promise<MetaResponse> {
    return this.search.meta();
  }
}
