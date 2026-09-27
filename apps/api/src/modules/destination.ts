import { Controller, Get, Inject, Injectable, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiError, parse } from '../common/http';
import { cityDto, continentDto, countryDto } from '../common/mappers';
import { code, continentCode, pageQuery } from '../common/validation';
import { REPO, type CityRepository, type ContinentRepository, type CountryRepository } from '../prisma/repositories';

@Injectable()
export class DestinationService {
  constructor(
    @Inject(REPO.continent) private readonly continents: ContinentRepository,
    @Inject(REPO.country) private readonly countries: CountryRepository,
    @Inject(REPO.city) private readonly cities: CityRepository,
  ) {}
  async listContinents(): Promise<object[]> { return (await this.continents.list()).map(continentDto); }
  async listCountries(query: unknown): Promise<object> {
    const input = parse(pageQuery.extend({ continentCode: continentCode.optional(), keyword: z.string().trim().min(1).max(100).optional() }), query);
    const result = await this.countries.list(input);
    return { items: result.items.map(countryDto), total: result.total, page: input.page, pageSize: input.pageSize };
  }
  async country(value: string): Promise<object> {
    const countryCode = parse(code, value);
    const country = await this.countries.find(countryCode);
    if (!country) throw new ApiError('NOT_FOUND', '国家不存在');
    return countryDto(country);
  }
  async listCities(value: string): Promise<object[]> {
    const countryCode = parse(code, value);
    if (!await this.countries.find(countryCode)) throw new ApiError('NOT_FOUND', '国家不存在');
    return (await this.cities.list(countryCode)).map(cityDto);
  }
}

@Controller()
export class DestinationController {
  constructor(@Inject(DestinationService) private readonly service: DestinationService) {}
  @Get('continents') continents(): Promise<object[]> { return this.service.listContinents(); }
  @Get('countries') countries(@Query() query: unknown): Promise<object> { return this.service.listCountries(query); }
  @Get('countries/:code') country(@Param('code') code: string): Promise<object> { return this.service.country(code); }
  @Get('countries/:code/cities') cities(@Param('code') code: string): Promise<object[]> { return this.service.listCities(code); }
}
