import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Body, Controller, Get, Inject, Injectable, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminRole, MediaUsage } from '@prisma/client';
import sharp from 'sharp';
import { z } from 'zod';
import { ApiError, parse } from '../common/http';
import { pageQuery } from '../common/validation';
import type { AppConfig } from '../config/env';
import { REPO, type MediaRepository } from '../prisma/repositories';
import { AdminGuard, RoleGuard, Roles } from './auth/auth';

export interface StorageService {
  upload(path: string, bytes: Buffer): Promise<void>;
  delete(path: string): Promise<void>;
  getUrl(path: string): string;
}
export const STORAGE = 'StorageService';
const safePath = /^[a-f0-9-]{36}\.webp$/;

@Injectable()
export class LocalStorageService implements StorageService {
  readonly root: string;
  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) { this.root = resolve(config.UPLOAD_ROOT_DIR); }
  private full(path: string): string {
    if (!safePath.test(path)) throw new ApiError('VALIDATION_FAILED', '文件路径不合法');
    return join(this.root, path);
  }
  async upload(path: string, bytes: Buffer): Promise<void> {
    const final = this.full(path);
    const temporary = join(this.root, `.${randomUUID()}.tmp`);
    await mkdir(this.root, { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, final);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  async delete(path: string): Promise<void> { await rm(this.full(path), { force: true }); }
  getUrl(path: string): string { this.full(path); return `${this.config.STATIC_BASE_URL.replace(/\/$/, '')}/${path}`; }
}

const signatures = [
  { mime: 'image/jpeg', match: (data: Buffer) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  { mime: 'image/png', match: (data: Buffer) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mime: 'image/webp', match: (data: Buffer) => data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
];
const usageMap: Record<string, MediaUsage> = {
  ATTRACTION_COVER: MediaUsage.ATTRACTION, ATTRACTION: MediaUsage.ATTRACTION,
  MEMORY_PHOTO: MediaUsage.MEMORY, MEMORY: MediaUsage.MEMORY,
  CONTENT_IMAGE: MediaUsage.CONTENT, CONTENT: MediaUsage.CONTENT, USER_AVATAR: MediaUsage.USER_AVATAR,
};

@Injectable()
export class MediaService {
  constructor(@Inject(REPO.media) private readonly media: MediaRepository, @Inject(STORAGE) private readonly storage: StorageService) {}
  async list(query: unknown): Promise<object> {
    const input = parse(pageQuery.extend({ usage: z.nativeEnum(MediaUsage).optional(),
      keyword: z.string().trim().min(1).max(100).optional() }), query);
    const result = await this.media.list(input.page, input.pageSize, input.usage, input.keyword);
    return { items: result.items.map((asset) => ({ id: asset.id, path: asset.path, url: asset.url,
      width: asset.width, height: asset.height, bytes: asset.bytes, mimeType: asset.mimeType,
      usage: asset.usage, createdAt: asset.createdAt.toISOString() })), total: result.total, page: input.page, pageSize: input.pageSize };
  }
  async upload(file: Express.Multer.File | undefined, body: unknown): Promise<object> {
    if (!file) throw new ApiError('FILE_NOT_FOUND', '请选择图片');
    if (file.size > 5 * 1024 * 1024) throw new ApiError('FILE_TOO_LARGE', '文件超过 5MB');
    const input = parse(z.object({ usage: z.enum(['ATTRACTION_COVER', 'ATTRACTION', 'MEMORY_PHOTO', 'MEMORY', 'CONTENT_IMAGE', 'CONTENT', 'USER_AVATAR']),
      alt: z.string().max(500).optional() }), body);
    if (!signatures.some((signature) => signature.mime === file.mimetype && signature.match(file.buffer)))
      throw new ApiError('FILE_TYPE_UNSUPPORTED', '仅支持真实的 JPG、PNG 或 WebP 图片');
    let output: { data: Buffer; info: sharp.OutputInfo };
    try {
      output = await sharp(file.buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
        .rotate().resize({ width: input.usage === 'USER_AVATAR' ? 512 : 1600,
          height: input.usage === 'USER_AVATAR' ? 512 : 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 }).toBuffer({ resolveWithObject: true });
    } catch {
      throw new ApiError('IMAGE_PROCESS_FAILED', '图片处理失败');
    }
    const path = `${randomUUID()}.webp`;
    try {
      await this.storage.upload(path, output.data);
      try {
        const asset = await this.media.create({ path, url: this.storage.getUrl(path), width: output.info.width,
          height: output.info.height, bytes: output.data.length, mimeType: 'image/webp', usage: usageMap[input.usage]! });
        return { id: asset.id, path: asset.path, url: asset.url, width: asset.width, height: asset.height,
          bytes: asset.bytes, mimeType: asset.mimeType, usage: input.usage };
      } catch (error) {
        await this.storage.delete(path);
        throw error;
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('IMAGE_PROCESS_FAILED', '图片保存失败');
    }
  }
}

@Controller('media')
@UseGuards(AdminGuard, RoleGuard)
export class MediaController {
  constructor(@Inject(MediaService) private readonly service: MediaService) {}
  @Get() @Roles(AdminRole.SUPER_ADMIN, AdminRole.CONTENT_ADMIN, AdminRole.REVIEWER, AdminRole.VIEWER)
  list(@Query() query: unknown): Promise<object> { return this.service.list(query); }
  @Post('upload')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CONTENT_ADMIN, AdminRole.REVIEWER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: unknown): Promise<object> { return this.service.upload(file, body); }
}
