import { Controller, Get, Inject, Injectable, Param } from '@nestjs/common';
import { VisaType } from '@travel-guide/constants';
import { getVisaFreshness, matchVisaPolicy } from '@travel-guide/core';
import type { VisaPolicy } from '@travel-guide/types';
import { parse } from '../common/http';
import { visaDto } from '../common/mappers';
import { code } from '../common/validation';
import { REPO, type VisaRepository } from '../prisma/repositories';

@Injectable()
export class VisaService {
  constructor(@Inject(REPO.visa) private readonly visas: VisaRepository) {}
  async get(passportInput: string, countryInput: string): Promise<object> {
    const passportRegion = parse(code, passportInput);
    const countryCode = parse(code, countryInput);
    const candidates = await this.visas.candidates(passportRegion, countryCode);
    const match = matchVisaPolicy(candidates as unknown as VisaPolicy[], passportRegion, countryCode);
    const row = match.policy ? candidates.find((candidate) => candidate.passportRegion === match.policy?.passportRegion &&
      candidate.destinationCountryCode === match.policy?.destinationCountryCode) : undefined;
    const policy = row ? visaDto(row) : null;
    const freshness = getVisaFreshness(row ? { lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      effectiveFrom: row.effectiveFrom?.toISOString() ?? null, effectiveTo: row.effectiveTo?.toISOString() ?? null } : null);
    const advice = !row ? { level: 'unknown', text: '未维护签证政策' } :
      row.visaType === VisaType.VISA_REQUIRED ? { level: 'prepare', text: '请提前准备签证材料并核对官方信息' } :
      row.visaType === VisaType.VISA_FREE ? { level: 'info', text: '请核对免签条件及最新官方信息' } :
      { level: 'unknown', text: '请核对最新官方签证政策' };
    return { policy, matchLevel: match.matchLevel, ...freshness, advice, available: Boolean(row),
      visaRequirement: row?.visaRequirement ?? null,
      maxStayDays: row?.maxStayDays ?? null,
      passportRequired: row?.passportRequired ?? null,
      passportValidityMonths: row?.passportValidityMonths ?? null,
      entrySummary: row?.entrySummary ?? null,
      requirementText: row?.requirementText ?? null,
      sourceUrl: row?.sourceUrl ?? null,
      lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null };
  }
}

@Controller('visa')
export class VisaController {
  constructor(@Inject(VisaService) private readonly service: VisaService) {}
  @Get(':passportRegion/:countryCode') get(@Param('passportRegion') passport: string, @Param('countryCode') country: string): Promise<object> {
    return this.service.get(passport, country);
  }
}
