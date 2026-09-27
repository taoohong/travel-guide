import 'reflect-metadata';
import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ApiExceptionFilter, requestIdMiddleware, ResponseEnvelope } from './common/http';
import { readConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const config = readConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.use(requestIdMiddleware);
  app.useGlobalInterceptors(new ResponseEnvelope());
  app.useGlobalFilters(new ApiExceptionFilter());
  const origins = config.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : config.MODE === 'production' ? false : true });
  const uploadRoot = resolve(config.UPLOAD_ROOT_DIR);
  app.use('/static', (req: Request, res: Response, next: NextFunction) => {
    const name = req.path.replace(/^\//, '');
    if (!/^[a-f0-9-]{36}\.webp$/.test(name)) { res.status(404).end(); return; }
    const path = join(uploadRoot, name);
    if (!existsSync(path)) { res.status(404).end(); return; }
    res.type('image/webp').setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(path).on('error', next).pipe(res);
  });
  await app.listen(config.PORT, config.HOST);
  console.log(JSON.stringify({ event: 'api_started', host: config.HOST, port: config.PORT, version: config.APP_VERSION }));
}

bootstrap().catch(() => { console.error('API startup failed. Check environment and database availability.'); process.exitCode = 1; });
