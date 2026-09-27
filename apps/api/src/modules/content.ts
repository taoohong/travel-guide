import { Body, Controller, Get, Inject, Injectable, Param, Post, Query } from '@nestjs/common';
import { CONTENT_MODULES } from '@travel-guide/constants';
import { diffContentVersion } from '@travel-guide/core';
import type { ContentVersionSnapshot } from '@travel-guide/types';
import { z } from 'zod';
import { ApiError, parse } from '../common/http';
import { guideDto } from '../common/mappers';
import { code, id } from '../common/validation';
import { REPO, type ContentRepository, type ContentVersionRepository, type CountryRepository, type GuideKind } from '../prisma/repositories';

@Injectable()
export class ContentService {
  constructor(@Inject(REPO.content) private readonly content: ContentRepository,
    @Inject(REPO.version) private readonly versions: ContentVersionRepository,
    @Inject(REPO.country) private readonly countries: CountryRepository) {}
  async snapshot(): Promise<ContentVersionSnapshot> {
    const rows = await this.versions.all();
    return Object.fromEntries(CONTENT_MODULES.map((module) => [module, rows.find((row) => row.module === module)?.version ?? 0])) as ContentVersionSnapshot;
  }
  async diff(body: unknown): Promise<object> {
    const local = parse(z.object({ local: z.record(z.number().int().nonnegative()) }).strict(), body).local;
    for (const key of Object.keys(local)) if (!CONTENT_MODULES.includes(key as typeof CONTENT_MODULES[number]))
      throw new ApiError('VALIDATION_FAILED', '未知内容模块');
    return diffContentVersion(local, await this.snapshot());
  }
  async guides(countryInput: string, kind: GuideKind, query: unknown): Promise<object[]> {
    const countryCode = parse(code, countryInput);
    if (!await this.countries.find(countryCode)) throw new ApiError('NOT_FOUND', '国家不存在');
    const { cityCode } = parse(z.object({ cityCode: z.string().trim().min(1).max(20).optional() }), query);
    return (await this.content.guides(countryCode, kind, cityCode)).map((item) => guideDto(kind, item));
  }
  async attraction(value: string): Promise<object> {
    const row = await this.content.attraction(parse(id, value));
    if (!row) throw new ApiError('NOT_FOUND', '景点不存在');
    return guideDto('attractions', row);
  }
}

@Controller()
export class ContentController {
  constructor(@Inject(ContentService) private readonly service: ContentService) {}
  @Get('content/version') version(): Promise<ContentVersionSnapshot> { return this.service.snapshot(); }
  @Post('content/version/diff') diff(@Body() body: unknown): Promise<object> { return this.service.diff(body); }
  @Get('countries/:code/transport') transport(@Param('code') code: string, @Query() query: unknown): Promise<object[]> { return this.service.guides(code, 'transport', query); }
  @Get('countries/:code/packing') packing(@Param('code') code: string, @Query() query: unknown): Promise<object[]> { return this.service.guides(code, 'packing', query); }
  @Get('countries/:code/tips') tips(@Param('code') code: string, @Query() query: unknown): Promise<object[]> { return this.service.guides(code, 'tips', query); }
  @Get('countries/:code/apps') apps(@Param('code') code: string, @Query() query: unknown): Promise<object[]> { return this.service.guides(code, 'apps', query); }
  @Get('countries/:code/attractions') attractions(@Param('code') code: string, @Query() query: unknown): Promise<object[]> { return this.service.guides(code, 'attractions', query); }
  @Get('attractions/:id') attraction(@Param('id') id: string): Promise<object> { return this.service.attraction(id); }
}
