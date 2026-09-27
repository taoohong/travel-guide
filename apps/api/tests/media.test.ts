import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { MediaAsset, Prisma } from '@prisma/client';
import { MediaService, type StorageService } from '../src/modules/media';
import type { MediaRepository } from '../src/prisma/repositories';

class MemoryStorage implements StorageService {
  readonly files = new Map<string, Buffer>();
  async upload(path: string, bytes: Buffer): Promise<void> { this.files.set(path, Buffer.from(bytes)); }
  async delete(path: string): Promise<void> { this.files.delete(path); }
  getUrl(path: string): string { return `http://local/static/${path}`; }
}
function repository(fail = false): MediaRepository {
  return { list: async () => ({ items: [], total: 0 }), create: async (data: Prisma.MediaAssetCreateInput) => {
    if (fail) throw new Error('database unavailable');
    return { ...data, id: 'media-1', createdAt: new Date() } as MediaAsset;
  } };
}
function file(buffer: Buffer, mimetype: string): Express.Multer.File {
  return { buffer, size: buffer.length, mimetype, originalname: '../../evil.jpg' } as Express.Multer.File;
}
async function image(format: 'jpeg' | 'png' | 'webp'): Promise<Buffer> {
  const engine = sharp({ create: { width: 2000, height: 1200, channels: 3, background: '#336699' } });
  return format === 'jpeg' ? engine.jpeg().toBuffer() : format === 'png' ? engine.png().toBuffer() : engine.webp().toBuffer();
}

describe('MediaService', () => {
  for (const [format, mime] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']] as const) {
    it(`${format} 解码、压缩并只保存 WebP`, async () => {
      const storage = new MemoryStorage();
      const result = await new MediaService(repository(), storage).upload(file(await image(format), mime), { usage: 'ATTRACTION_COVER' }) as { path: string; width: number; mimeType: string };
      expect(result.path).toMatch(/^[a-f0-9-]{36}\.webp$/);
      expect(result.mimeType).toBe('image/webp');
      expect(result.width).toBe(1600);
      expect(storage.files.size).toBe(1);
      expect((await sharp(storage.files.get(result.path)).metadata()).format).toBe('webp');
      expect([...storage.files.keys()].every((path) => path.endsWith('.webp'))).toBe(true);
    });
  }

  it('缺文件、超大文件、伪造 MIME 和损坏图片分别返回正确错误', async () => {
    const service = new MediaService(repository(), new MemoryStorage());
    await expect(service.upload(undefined, { usage: 'CONTENT_IMAGE' })).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    await expect(service.upload(file(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg'), { usage: 'CONTENT_IMAGE' }))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await expect(service.upload(file(await image('png'), 'image/jpeg'), { usage: 'CONTENT_IMAGE' }))
      .rejects.toMatchObject({ code: 'FILE_TYPE_UNSUPPORTED' });
    await expect(service.upload(file(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), { usage: 'CONTENT_IMAGE' }))
      .rejects.toMatchObject({ code: 'IMAGE_PROCESS_FAILED' });
  });

  it('数据库保存失败会删除已压缩文件', async () => {
    const storage = new MemoryStorage();
    await expect(new MediaService(repository(true), storage).upload(file(await image('jpeg'), 'image/jpeg'), { usage: 'MEMORY_PHOTO' }))
      .rejects.toMatchObject({ code: 'IMAGE_PROCESS_FAILED' });
    expect(storage.files.size).toBe(0);
  });
});
