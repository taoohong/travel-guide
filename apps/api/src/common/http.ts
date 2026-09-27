import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { HttpException, Injectable, Catch } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { ZodError, type ZodTypeAny, type output } from 'zod';

export type ErrorCode = 'VALIDATION_FAILED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' |
  'DUPLICATE_CONTENT' | 'FILE_NOT_FOUND' | 'FILE_TOO_LARGE' | 'FILE_TYPE_UNSUPPORTED' |
  'IMAGE_PROCESS_FAILED' | 'REQUEST_TIMEOUT' | 'INTERNAL_ERROR' | 'INVITE_EXPIRED' | 'INVITE_REVOKED' |
  'INVITE_EXHAUSTED' | 'RATE_LIMITED';

const statusByCode: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
  DUPLICATE_CONTENT: 409, FILE_NOT_FOUND: 400, FILE_TOO_LARGE: 413, FILE_TYPE_UNSUPPORTED: 422,
  IMAGE_PROCESS_FAILED: 422, REQUEST_TIMEOUT: 408, INTERNAL_ERROR: 500,
  INVITE_EXPIRED: 410, INVITE_REVOKED: 410, INVITE_EXHAUSTED: 410, RATE_LIMITED: 429,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly details: object = {}) {
    super(message);
    this.status = statusByCode[code];
  }
}

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ApiError('VALIDATION_FAILED', '请求参数不合法', {
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

export interface ApiRequest extends Request { requestId: string; admin?: { id: string; role: string; username: string }; user?: { id: string } }

export function requestIdMiddleware(req: Request, res: Response, next: () => void): void {
  const supplied = req.header('X-Request-Id');
  const id = supplied && /^[\w.-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  (req as ApiRequest).requestId = id;
  res.setHeader('X-Request-Id', id);
  const started = performance.now();
  res.on('finish', () => {
    const errorCode = (res as Response & { errorCode?: ErrorCode }).errorCode;
    console.log(JSON.stringify({ requestId: id, method: req.method, path: req.originalUrl, status: res.statusCode,
      durationMs: Math.round(performance.now() - started), errorCode: errorCode ?? null }));
  });
  next();
}

@Injectable()
export class ResponseEnvelope implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<ApiRequest>();
    return next.handle().pipe(map((data: unknown) => ({ success: true, data, requestId: req.requestId, timestamp: new Date().toISOString() })));
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<ApiRequest>();
    const res = http.getResponse<Response & { errorCode?: ErrorCode }>();
    let mapped: ApiError;
    if (error instanceof ApiError) mapped = error;
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      mapped = error.code === 'P2002' ? new ApiError('DUPLICATE_CONTENT', '内容已存在') :
        error.code === 'P2025' ? new ApiError('NOT_FOUND', '记录不存在') :
        error.code === 'P2003' ? new ApiError('CONFLICT', '关联记录不存在或仍被使用') :
        new ApiError('INTERNAL_ERROR', '服务暂时不可用');
    } else if (error instanceof ZodError) mapped = new ApiError('VALIDATION_FAILED', '请求参数不合法');
    else if (error && typeof error === 'object' && 'code' in error && error.code === 'LIMIT_FILE_SIZE')
      mapped = new ApiError('FILE_TOO_LARGE', '文件超过 5MB');
    else if (error instanceof HttpException) {
      const status = error.getStatus();
      mapped = status === 404 ? new ApiError('NOT_FOUND', '资源不存在') :
        status === 401 ? new ApiError('UNAUTHORIZED', '请先登录') :
        status === 403 ? new ApiError('FORBIDDEN', '无权限') :
        status === 413 ? new ApiError('FILE_TOO_LARGE', '文件超过 5MB') :
        status === 408 ? new ApiError('REQUEST_TIMEOUT', '请求超时') :
        status < 500 ? new ApiError('VALIDATION_FAILED', '请求参数不合法') : new ApiError('INTERNAL_ERROR', '服务暂时不可用');
    } else mapped = new ApiError('INTERNAL_ERROR', '服务暂时不可用');
    res.errorCode = mapped.code;
    res.status(mapped.status).json({ success: false, code: mapped.code, message: mapped.message, details: mapped.details,
      requestId: req.requestId ?? randomUUID(), timestamp: new Date().toISOString() });
  }
}
