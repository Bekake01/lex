import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { ArticlesBatchResponse, MetaResponse, SearchResponse } from '../contract.js';
import { articlesBatchRequestSchema, parseBody, searchRequestSchema } from './schemas.js';
import { SearchService } from './search.service.js';

/** All routes need the x-lex-api-key header (global ApiKeyGuard). */
@Controller()
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
