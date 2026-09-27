import { Controller, Get, Inject, Injectable } from '@nestjs/common';
import { REPO, type HealthRepository } from '../prisma/repositories';
import type { AppConfig } from '../config/env';

@Injectable()
export class HealthService {
  constructor(@Inject(REPO.health) private readonly db: HealthRepository, @Inject('APP_CONFIG') private readonly config: AppConfig) {}
  async status(): Promise<object> {
    const database = await this.db.ping() ? 'ok' : 'unavailable';
    return { status: database === 'ok' ? 'ok' : 'degraded', uptimeSeconds: Math.floor(process.uptime()),
      version: this.config.APP_VERSION, database, timestamp: new Date().toISOString() };
  }
}

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly service: HealthService) {}
  @Get() status(): Promise<object> { return this.service.status(); }
  @Get('live') live(): object { return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()),
    version: process.env.APP_VERSION ?? '0.1.0', database: 'unknown', timestamp: new Date().toISOString() }; }
}
